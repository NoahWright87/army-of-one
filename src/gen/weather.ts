import { WEATHER_TUNING } from '../content/tuning';
import { hash01 } from '../sim/core/hash';
import type { Weather, WeatherKind } from '../sim/world/map';

/** A separate roll keeps weather independent of the map generator's random sequence. */
export function weatherForLevel(seed: number, level: number): WeatherKind | undefined {
  return hash01(`weather:${seed}:${level}`) < WEATHER_TUNING.fogChance ? 'fog' : undefined;
}

export function generateWeather(kind: WeatherKind, key: string, w: number, h: number): Weather {
  const { bankSpacing, bankRadius } = WEATHER_TUNING;
  const cols = Math.max(1, Math.ceil(w / bankSpacing));
  const rows = Math.max(1, Math.ceil(h / bankSpacing));
  const banks = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const id = `${key}:${x}:${y}`;
      banks.push({
        x: ((x + 0.23 + 0.54 * hash01(`${id}:x`)) * w) / cols,
        y: ((y + 0.23 + 0.54 * hash01(`${id}:y`)) * h) / rows,
        radius: bankRadius * (0.8 + 0.4 * hash01(`${id}:size`)),
      });
    }
  }
  return { kind, banks };
}
