import { describe, expect, it } from 'vitest';
import { AYAH_OF_THE_DAY, ayahForDay } from './ayahOfTheDay';

/** Day strings for `count` consecutive days starting at `start`. */
function consecutiveDays(start: string, count: number): string[] {
  const base = Date.parse(`${start}T12:00:00Z`);
  return Array.from({ length: count }, (_, index) =>
    new Date(base + index * 86_400_000).toISOString().slice(0, 10),
  );
}

describe('ayahForDay', () => {
  it('gives the same ayah for the same day', () => {
    expect(ayahForDay('2026-08-24')).toEqual(ayahForDay('2026-08-24'));
  });

  it('gives a different ayah on consecutive days', () => {
    expect(ayahForDay('2026-08-24')).not.toEqual(ayahForDay('2026-08-25'));
  });

  it('shows every entry exactly once before any repeats', () => {
    // The property the cycle exists for. A hash-and-modulo seed collides: it
    // would show the same ayah twice in a fortnight while some entries never
    // appear at all, which is the whole reason this is not a hash.
    const seen = consecutiveDays('2026-01-01', AYAH_OF_THE_DAY.length).map(
      (day) => `${ayahForDay(day).surah}:${ayahForDay(day).ayah}`,
    );

    expect(new Set(seen).size).toBe(AYAH_OF_THE_DAY.length);
  });

  it('wraps to the start on the day after a full cycle', () => {
    const days = consecutiveDays('2026-01-01', AYAH_OF_THE_DAY.length + 1);

    expect(ayahForDay(days[AYAH_OF_THE_DAY.length]!)).toEqual(ayahForDay(days[0]!));
  });

  it('does not fall off the list for a day before 1970', () => {
    // Date.parse is negative there, and a bare `%` in JS keeps the sign, so an
    // unguarded modulo indexes past the start of the array and returns
    // undefined -- a blank card rather than an ayah.
    const entry = ayahForDay('1969-07-20');

    expect(AYAH_OF_THE_DAY).toContainEqual(entry);
  });

  it('only ever names a real ayah', () => {
    for (const entry of AYAH_OF_THE_DAY) {
      expect(Number.isInteger(entry.surah)).toBe(true);
      expect(entry.surah).toBeGreaterThanOrEqual(1);
      expect(entry.surah).toBeLessThanOrEqual(114);
      expect(Number.isInteger(entry.ayah)).toBe(true);
      expect(entry.ayah).toBeGreaterThanOrEqual(1);
    }
  });

  it('carries no duplicate coordinate', () => {
    // A duplicate is invisible in the list and shows as the same ayah twice in
    // one cycle, which reads as the rotation being broken.
    const coordinates = AYAH_OF_THE_DAY.map((entry) => `${entry.surah}:${entry.ayah}`);

    expect(new Set(coordinates).size).toBe(coordinates.length);
  });
});
