/**
 * Checks the delivered miniature art in `assets/miniatures/` against the spec in
 * `src/content/miniatures.ts` and writes review sheets (docs/art/VERIFY.md).
 *
 *   npm run check:art                    # check whatever has been delivered so far
 *   npm run check:art -- --priority 1    # also list what's still missing up to that tier
 *   npm run check:art -- --require       # missing files (in those tiers) count as errors
 *   npm run check:art -- --sheets        # also write assets/miniatures/_review/*.png
 *
 * Exit code 1 on any error (warnings never fail the run, but read them).
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INFANTRY_ROLES, miniatureFiles } from '../src/content/miniatures';
import {
  Canvas,
  checkFile,
  checkSet,
  drawPiece,
  encodePng,
  lcg,
  loadPng,
  pieceFor,
  type Img,
  type Issue,
} from './miniatures-lib';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
export const MINIATURES_DIR = join(ROOT, 'assets', 'miniatures');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--') ? process.argv[i + 1] : '1';
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function writeSheets(images: Map<string, Img>, dir: string): string[] {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  const save = (name: string, img: Img) => {
    writeFileSync(join(dir, name), encodePng(img));
    written.push(name);
  };

  // 1. Rotation sheet: every role at 8 angles, three ways.
  //    row A: aim (figure turns, base stays), row B: the whole piece turned (camera rotation),
  //    row C: the enemy's silver version, aiming.
  const roles = INFANTRY_ROLES.filter((r) => pieceFor(images, r, 'gold') !== null);
  if (roles.length > 0) {
    const cell = 128;
    const cols = 8;
    const sheet = new Canvas(cols * cell, roles.length * 3 * cell);
    roles.forEach((role, ri) => {
      const gold = pieceFor(images, role, 'gold')!;
      const silver = pieceFor(images, role, 'silver');
      for (let k = 0; k < cols; k++) {
        const a = (k * Math.PI) / 4;
        const x = k * cell + cell / 2;
        drawPiece(sheet, gold, x, (ri * 3 + 0) * cell + cell / 2, gold.fitPx, a);
        drawPiece(sheet, gold, x, (ri * 3 + 1) * cell + cell / 2, gold.fitPx, 0, {
          cameraRotation: a,
        });
        if (silver) drawPiece(sheet, silver, x, (ri * 3 + 2) * cell + cell / 2, silver.fitPx, a);
      }
    });
    save('rotation.png', sheet.toImg());
  }

  // 2. Swarm: one live soldier among echoes and enemies, at game size (32 px) and 48 px.
  const echoRoles = INFANTRY_ROLES.filter((r) => pieceFor(images, r, 'gold-tarnished') !== null);
  const enemyRoles = INFANTRY_ROLES.filter((r) => pieceFor(images, r, 'silver') !== null);
  const liveRole = INFANTRY_ROLES.find((r) => pieceFor(images, r, 'gold') !== null);
  if (liveRole && echoRoles.length > 0) {
    for (const [diameter, zoom] of [
      [32, 2],
      [48, 1],
    ] as const) {
      const w = 640; // about a screen: 20 × 11 pieces at 32 px
      const h = 360;
      const scale = diameter / 32;
      const c = new Canvas(Math.round(w * scale), Math.round(h * scale));
      const rnd = lcg(7);
      const place = () => [(0.08 + rnd() * 0.84) * c.w, (0.1 + rnd() * 0.8) * c.h] as const;
      for (let i = 0; i < 60; i++) {
        const role = echoRoles[Math.floor(rnd() * echoRoles.length)]!;
        const [x, y] = place();
        drawPiece(
          c,
          pieceFor(images, role, 'gold-tarnished')!,
          x,
          y,
          diameter,
          rnd() * Math.PI * 2,
          { alpha: 0.85 },
        );
      }
      if (enemyRoles.length > 0) {
        for (let i = 0; i < 18; i++) {
          const role = enemyRoles[Math.floor(rnd() * enemyRoles.length)]!;
          const [x, y] = place();
          drawPiece(c, pieceFor(images, role, 'silver')!, x, y, diameter, rnd() * Math.PI * 2);
        }
      }
      // The live soldier, drawn last, off-center so you have to FIND it.
      drawPiece(c, pieceFor(images, liveRole, 'gold')!, c.w * 0.62, c.h * 0.4, diameter, 0.6);
      save(`swarm_${diameter}px_x${zoom}.png`, c.toImg(zoom));
    }
  }
  return written;
}

function main(): number {
  const specs = miniatureFiles();
  const maxPriority = Number(arg('priority') ?? 3);
  const require = flag('require');

  const present = new Map<string, Img>();
  const found = existsSync(MINIATURES_DIR)
    ? readdirSync(MINIATURES_DIR).filter((f) => f.endsWith('.png'))
    : [];
  for (const f of found) present.set(f, loadPng(join(MINIATURES_DIR, f)));

  const issues: Issue[] = [];
  const delivered: { spec: (typeof specs)[number]; img: Img }[] = [];
  const known = new Set(specs.map((s) => s.file));

  for (const f of found) {
    if (!known.has(f)) {
      issues.push({
        severity: 'warn',
        file: f,
        message: 'not in the spec (src/content/miniatures.ts); misnamed?',
      });
    }
  }
  for (const spec of specs) {
    const img = present.get(spec.file);
    if (!img) continue;
    delivered.push({ spec, img });
    issues.push(...checkFile(spec, img));
  }
  issues.push(...checkSet(delivered));

  const missing = specs.filter((s) => s.priority <= maxPriority && !present.has(s.file));
  if (require) {
    for (const m of missing) issues.push({ severity: 'error', file: m.file, message: 'missing' });
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');
  for (const i of [...errors, ...warns])
    console.log(`${i.severity === 'error' ? 'ERROR' : 'warn '}  ${i.file}: ${i.message}`);

  console.log(
    `\n${delivered.length}/${specs.length} files delivered ` +
      `(tier 1: ${specs.filter((s) => s.priority === 1 && present.has(s.file)).length}/${specs.filter((s) => s.priority === 1).length}, ` +
      `tier 2: ${specs.filter((s) => s.priority === 2 && present.has(s.file)).length}/${specs.filter((s) => s.priority === 2).length}, ` +
      `tier 3: ${specs.filter((s) => s.priority === 3 && present.has(s.file)).length}/${specs.filter((s) => s.priority === 3).length}); ` +
      `${errors.length} errors, ${warns.length} warnings`,
  );
  if (missing.length > 0 && !require) {
    console.log(
      `still missing up to tier ${maxPriority}: ${missing.map((m) => m.file).join(', ')}`,
    );
  }

  if (flag('sheets')) {
    const out = writeSheets(present, join(MINIATURES_DIR, '_review'));
    console.log(
      out.length
        ? `wrote assets/miniatures/_review/{${out.join(', ')}}`
        : 'no sheets: nothing assemblable yet',
    );
  }
  return errors.length > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
