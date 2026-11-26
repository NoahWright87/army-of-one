import { describe, expect, it } from 'vitest';
import { buildInfo, formatBuildTime, formatBuildUtc } from './build-info';

describe('build info', () => {
  it('reads unknown without a stamp (tests, tools)', () => {
    expect(buildInfo()).toEqual({
      version: 'unknown',
      sha: 'unknown',
      branch: 'unknown',
      time: '',
    });
  });

  it('formats a build time with UTC, and survives junk', () => {
    expect(formatBuildTime('2026-11-26T01:07:09.000Z', 'en-US')).toContain('2026');
    expect(formatBuildUtc('2026-11-26T01:07:09.000Z')).toBe('UTC 2026-11-26 01:07');
    expect(formatBuildUtc('')).toBe('');
    expect(formatBuildTime('')).toBe('unknown');
    expect(formatBuildTime('not a date')).toBe('unknown');
  });
});
