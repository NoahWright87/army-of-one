/**
 * Speech markup → timed glyphs. Pure (no Phaser), so it's unit-tested.
 *
 *   [shake]INCOMING![/] [p] Get [red]down[/]!
 *
 * Tags (square brackets, so they never clash with `{name}` variables from strings.ts):
 * - Effects: any registered name (`[shake]`, `[wave]`, `[fly]`, `[slam]`, … see effects.ts).
 * - Colour: `[red]`, `[gold]`, `[blue]`, `[green]`, `[grey]`, `[white]` or `[#ff8800]`.
 * - Size: `[big]`, `[small]`.
 * - `[/]` closes the last open tag, `[/shake]` the last `[shake]`.
 * - Pacing (switches, not nested): `[all]` (the rest appears at once), `[words]` (word by word),
 *   `[letters]` (letter by letter). Without one, a short line (≤ `autoAllWords` words) appears
 *   all at once and a longer one word by word.
 * - `[p]` pauses (`[p=600]` for 600 ms). `[quake]` shakes the screen at that moment.
 * - `[[` is a literal `[`.
 */
import type { SpeechTuning } from '../../content/world-text';
import { getEffect } from './effects';

export const COLORS: Readonly<Record<string, string>> = {
  red: '#ff4b3e',
  gold: '#ffd34d',
  blue: '#66b8ff',
  green: '#6ee07a',
  grey: '#a9b0b7',
  white: '#ffffff',
};

export type Pacing = 'all' | 'words' | 'letters';

export interface Glyph {
  ch: string;
  /** Index of the word it belongs to (spaces belong to no word: -1). */
  word: number;
  effects: string[];
  color: string | null;
  /** Size multiplier (1 = normal). */
  size: number;
  /** When it starts appearing, ms after the line starts. */
  appearMs: number;
}

export interface Cue {
  atMs: number;
  name: 'quake';
}

export interface ParsedLine {
  glyphs: Glyph[];
  cues: Cue[];
  /** When the last glyph has landed. */
  revealEndMs: number;
  /** Visible characters (for the hold time). */
  chars: number;
}

type Timing = Pick<
  SpeechTuning,
  | 'autoAllWords'
  | 'wordMs'
  | 'wordPerCharMs'
  | 'letterMs'
  | 'pauseMs'
  | 'popMs'
  | 'bigScale'
  | 'smallScale'
>;

interface Open {
  name: string;
  kind: 'effect' | 'color' | 'size';
  value: string | number;
}

type Token =
  | { t: 'text'; s: string }
  | { t: 'open'; tag: Open }
  | { t: 'close'; name: string | null }
  | { t: 'pace'; mode: Pacing }
  | { t: 'pause'; ms: number | null }
  | { t: 'cue'; name: 'quake' }
  | { t: 'newline' };

function tagToken(body: string, tm: Timing): Token | null {
  if (body.startsWith('/')) return { t: 'close', name: body.slice(1) || null };
  const [name, arg] = body.split('=', 2) as [string, string | undefined];
  if (name === 'all' || name === 'words' || name === 'letters') return { t: 'pace', mode: name };
  if (name === 'p' || name === 'pause') {
    const ms = arg !== undefined ? Number(arg) : NaN;
    return { t: 'pause', ms: Number.isFinite(ms) ? ms : null };
  }
  if (name === 'quake') return { t: 'cue', name: 'quake' };
  if (name === 'big') return { t: 'open', tag: { name, kind: 'size', value: tm.bigScale } };
  if (name === 'small') return { t: 'open', tag: { name, kind: 'size', value: tm.smallScale } };
  if (COLORS[name]) return { t: 'open', tag: { name, kind: 'color', value: COLORS[name] } };
  if (/^#[0-9a-fA-F]{6}$/.test(name))
    return { t: 'open', tag: { name, kind: 'color', value: name } };
  if (getEffect(name)) return { t: 'open', tag: { name, kind: 'effect', value: name } };
  return null;
}

export function tokenize(src: string, tm: Timing): Token[] {
  const out: Token[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ t: 'text', s: text });
    text = '';
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === '[' && src[i + 1] === '[') {
      text += '[';
      i++;
      continue;
    }
    if (c === '\n') {
      flush();
      out.push({ t: 'newline' });
      continue;
    }
    if (c === '[') {
      const end = src.indexOf(']', i);
      const tok = end > i ? tagToken(src.slice(i + 1, end).trim(), tm) : null;
      if (tok) {
        flush();
        out.push(tok);
        i = end;
        continue;
      }
    }
    text += c;
  }
  flush();
  return out;
}

/** Plain text of a markup line (tags removed). */
export function plainText(src: string, tm: Timing): string {
  return tokenize(src, tm)
    .map((t) => (t.t === 'text' ? t.s : t.t === 'newline' ? '\n' : ''))
    .join('');
}

export function parseLine(src: string, tm: Timing): ParsedLine {
  const tokens = tokenize(src, tm);
  const plain = tokens.map((t) => (t.t === 'text' ? t.s : ' ')).join('');
  const wordCount = plain.split(/\s+/).filter(Boolean).length;
  let mode: Pacing = wordCount <= tm.autoAllWords ? 'all' : 'words';

  const stack: Open[] = [];
  const glyphs: Glyph[] = [];
  const cues: Cue[] = [];
  let t = 0;
  let word = -1;
  let inWord = false;
  let wordLen = 0;
  /** In 'all' mode: something was shown at `t` that the next beat must wait for. */
  let allPending = false;

  const endWord = () => {
    if (!inWord) return;
    inWord = false;
    if (mode === 'words') t += tm.wordMs + tm.wordPerCharMs * wordLen;
    wordLen = 0;
  };
  const settleAll = () => {
    if (allPending) t += tm.popMs;
    allPending = false;
  };

  for (const tok of tokens) {
    switch (tok.t) {
      case 'open':
        stack.push(tok.tag);
        break;
      case 'close': {
        const i =
          tok.name === null ? stack.length - 1 : stack.map((s) => s.name).lastIndexOf(tok.name);
        if (i >= 0) stack.splice(i, 1);
        break;
      }
      case 'pace':
        endWord();
        settleAll();
        mode = tok.mode;
        break;
      case 'pause':
        endWord();
        settleAll();
        t += tok.ms ?? tm.pauseMs;
        break;
      case 'cue':
        endWord();
        cues.push({ atMs: t, name: tok.name });
        break;
      case 'newline':
        endWord();
        glyphs.push(glyph('\n', -1, stack, t));
        break;
      case 'text':
        for (const ch of tok.s) {
          if (/\s/.test(ch)) {
            endWord();
            glyphs.push(glyph(' ', -1, stack, t));
            continue;
          }
          if (!inWord) {
            inWord = true;
            word++;
          }
          wordLen++;
          glyphs.push(glyph(ch, word, stack, t));
          if (mode === 'letters') t += tm.letterMs;
          if (mode === 'all') allPending = true;
        }
        break;
    }
  }
  const visible = glyphs.filter((g) => g.ch.trim());
  const last = visible.reduce((m, g) => Math.max(m, g.appearMs), 0);
  return { glyphs, cues, revealEndMs: last + tm.popMs, chars: visible.length };
}

function glyph(ch: string, word: number, stack: readonly Open[], t: number): Glyph {
  let color: string | null = null;
  let size = 1;
  const effects: string[] = [];
  for (const s of stack) {
    if (s.kind === 'color') color = s.value as string;
    else if (s.kind === 'size') size *= s.value as number;
    else effects.push(s.name);
  }
  return { ch, word, effects, color, size, appearMs: t };
}

// ---- layout -----------------------------------------------------------------------------------

export interface Placed {
  /** Centre of the glyph relative to the anchor (bottom centre of the text block), px. */
  x: number;
  y: number;
}

/**
 * Word-wraps and centres the glyphs above an anchor at (0, 0): the last line's bottom sits on the
 * anchor and earlier lines stack upwards. `measure(g)` is a glyph's advance width (px) and
 * `lineHeight(size)` the height of a line of that size.
 */
export function layoutGlyphs(
  glyphs: readonly Glyph[],
  measure: (g: Glyph) => number,
  lineHeight: (size: number) => number,
  maxWidth: number,
): Placed[] {
  // Split into words (runs of non-space glyphs) and break where they don't fit.
  type Item = { idx: number[]; width: number; space: boolean; br: boolean };
  const items: Item[] = [];
  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i]!;
    const space = g.ch === ' ';
    const br = g.ch === '\n';
    const last = items[items.length - 1];
    if (!space && !br && last && !last.space && !last.br) {
      last.idx.push(i);
      last.width += measure(g);
    } else {
      items.push({ idx: [i], width: br ? 0 : measure(g), space, br });
    }
  }
  const lines: Item[][] = [[]];
  let w = 0;
  for (const it of items) {
    const line = lines[lines.length - 1]!;
    if (it.br) {
      lines.push([]);
      w = 0;
      continue;
    }
    if (!it.space && w + it.width > maxWidth && line.some((x) => !x.space)) {
      while (line.length && line[line.length - 1]!.space) line.pop();
      lines.push([it]);
      w = it.width;
      continue;
    }
    if (it.space && !line.length) continue;
    line.push(it);
    w += it.width;
  }
  const out: Placed[] = glyphs.map(() => ({ x: 0, y: 0 }));
  const heights = lines.map((l) =>
    lineHeight(Math.max(1, ...l.flatMap((it) => it.idx.map((i) => glyphs[i]!.size)))),
  );
  let bottom = 0;
  for (let li = lines.length - 1; li >= 0; li--) {
    const line = lines[li]!;
    while (line.length && line[line.length - 1]!.space) line.pop();
    const width = line.reduce((s, it) => s + it.width, 0);
    let x = -width / 2;
    const h = heights[li]!;
    for (const it of line) {
      for (const i of it.idx) {
        const gw = it.space ? it.width : measure(glyphs[i]!);
        out[i] = { x: x + gw / 2, y: bottom - h / 2 };
        x += gw;
      }
    }
    bottom -= h;
  }
  return out;
}
