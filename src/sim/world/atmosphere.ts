import { WEATHER_TUNING } from '../../content/tuning';
import { TICKS_PER_SECOND, type Tick } from '../core/time';
import type { Vec2 } from '../core/vec';
import { rayCircle, rayRect } from './collision';
import type { FogBank, MapDef, Weather } from './map';

/** Lightweight context shared by the renderer, aim assist and the simulation. */
export interface Atmosphere {
  map: Pick<MapDef, 'mist' | 'weather'>;
  tick: Tick;
}

const fogCache = new WeakMap<Weather, { tick: Tick; banks: readonly FogBank[] }>();
const NO_BANKS: readonly FogBank[] = [];

/** Move slowly on the battle clock so a replay and the sim see the same banks. */
export function fogBanksAt(weather: Weather | undefined, tick: Tick): readonly FogBank[] {
  if (weather?.kind !== 'fog') return NO_BANKS;
  const cached = fogCache.get(weather);
  if (cached?.tick === tick) return cached.banks;
  const { driftRadius, driftSeconds } = WEATHER_TUNING;
  const angle = (2 * Math.PI * tick) / (driftSeconds * TICKS_PER_SECOND);
  const banks = weather.banks.map((bank, i) => ({
    x: bank.x + driftRadius * Math.sin(angle + i * 2.4),
    y: bank.y + driftRadius * 0.55 * Math.sin(angle * 0.87 + i * 1.7),
    radius: bank.radius,
  }));
  fogCache.set(weather, { tick, banks });
  return banks;
}

export function atmosphericTransmission(
  from: Vec2,
  to: Vec2,
  atmosphere: Atmosphere | undefined,
  mistAttenuation: number,
  fogAttenuation: number,
): number {
  if (!atmosphere) return 1;
  const { map, tick } = atmosphere;
  if (!map.mist?.length && !map.weather) return 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return 1;
  const forward = { x: dx / distance, y: dy / distance };
  const back = { x: -forward.x, y: -forward.y };
  const crossed = (entry: number, reverse: number | null) =>
    reverse === null ? 0 : Math.max(0, distance - entry - reverse);

  let attenuation = 0;
  for (const rect of map.mist ?? []) {
    const entry = rayRect(from, forward, rect);
    if (entry !== null && entry < distance) {
      attenuation += mistAttenuation * crossed(entry, rayRect(to, back, rect));
    }
  }
  for (const bank of fogBanksAt(map.weather, tick)) {
    const entry = rayCircle(from, forward, bank, bank.radius);
    if (entry !== null && entry < distance) {
      attenuation += fogAttenuation * crossed(entry, rayCircle(to, back, bank, bank.radius));
    }
  }
  return Math.exp(-attenuation);
}
