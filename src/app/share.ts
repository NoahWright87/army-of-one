/**
 * (PHASE12-e) Shareable runs ([D79]). A run is a mission's saved state (every recording plus the
 * timeline truth), packed with the same save code the game uses (so loading it back is validated
 * exactly like a save), plus any sim-tuning overrides it was played with. Compressed (deflate)
 * and base64url'd, it fits in a link: `…/#replay=<packed>`.
 *
 * The sim is deterministic, so the recordings replay the same battle — on the same game
 * version. Links point at this build's own permanent address (Netlify's per-deploy URL, injected
 * at build time as `__AOO_DEPLOY_URL__`), so a balance patch never breaks an old link.
 */
import type { DeepPartial, Tuning } from '../content/tuning';
import type { MissionId, MissionState } from '../contracts/mission';
import { loadMission, MissionSaver } from '../persistence/mission-store';
import { MemoryStore } from '../persistence/storage';

export const SHARE_VERSION = 1;
export const SHARE_HASH = 'replay';

/** What a link carries. */
export interface SharedRun {
  missionId: MissionId;
  state: MissionState;
  /** Sim tuning overrides it was played with (F2 → Sim tuning); empty = defaults. */
  tuning: DeepPartial<Tuning>;
}

interface Payload {
  v: typeof SHARE_VERSION;
  m: MissionId;
  t: DeepPartial<Tuning>;
  /** The save's key/value pairs (no backups, no life in progress). */
  e: Record<string, string>;
}

/** The run as plain JSON (before compression). */
export async function encodeRun(run: SharedRun): Promise<string> {
  const store = new MemoryStore();
  const { inProgress: _skip, ...state } = run.state;
  void _skip;
  const res = await new MissionSaver(store, run.missionId).save(state);
  if (!res.ok) throw new Error(`share: could not pack the run (${res.error})`);
  const e: Record<string, string> = {};
  for (const [k, v] of store.data) if (!k.endsWith(':backup')) e[k] = v;
  const p: Payload = { v: SHARE_VERSION, m: run.missionId, t: run.tuning, e };
  return JSON.stringify(p);
}

/** Inverse of `encodeRun`; throws on anything malformed. */
export async function decodeRun(json: string): Promise<SharedRun> {
  const p = JSON.parse(json) as Partial<Payload>;
  if (p.v !== SHARE_VERSION || typeof p.m !== 'string' || !p.e || typeof p.e !== 'object') {
    throw new Error('share: not a replay this version understands');
  }
  const store = new MemoryStore();
  for (const [k, v] of Object.entries(p.e)) if (typeof v === 'string') store.data.set(k, v);
  const loaded = await loadMission(store, p.m);
  if (!loaded.ok) throw new Error(`share: unreadable replay (${loaded.message})`);
  return { missionId: p.m, state: loaded.state, tuning: p.t ?? {} };
}

/** Packed for a link: deflate + base64url. */
export async function packRun(run: SharedRun): Promise<string> {
  const bytes = await deflate(new TextEncoder().encode(await encodeRun(run)));
  return toBase64Url(bytes);
}

export async function unpackRun(packed: string): Promise<SharedRun> {
  const json = new TextDecoder().decode(await inflate(fromBase64Url(packed)));
  return decodeRun(json);
}

declare const __AOO_DEPLOY_URL__: string;

/** This build's permanent address (falls back to the current page). */
export function buildBaseUrl(): string {
  const pinned = typeof __AOO_DEPLOY_URL__ === 'string' ? __AOO_DEPLOY_URL__ : '';
  if (pinned) return pinned.endsWith('/') ? pinned : `${pinned}/`;
  return `${window.location.origin}${window.location.pathname}`;
}

export function shareUrl(packed: string): string {
  return `${buildBaseUrl()}#${SHARE_HASH}=${packed}`;
}

/** The packed run in `hash` (`#replay=…`), or null. */
export function packedFromHash(hash: string): string | null {
  const m = new RegExp(`^#${SHARE_HASH}=([A-Za-z0-9_-]+)$`).exec(hash);
  return m ? m[1]! : null;
}

/**
 * Hands a link to the player: the phone's share sheet when there is one, else the clipboard.
 * Returns how it went (for a short confirmation).
 */
export async function offerLink(
  url: string,
  title: string,
): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      await navigator.share({ title, url });
      return 'shared';
    }
  } catch {
    // Cancelled or refused: fall back to copying.
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

// ---------- bytes ----------

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(
    new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream),
  );
  return new Uint8Array(await out.arrayBuffer());
}
const deflate = (b: Uint8Array) => pipe(b, new CompressionStream('deflate-raw'));
const inflate = (b: Uint8Array) => pipe(b, new DecompressionStream('deflate-raw'));

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
