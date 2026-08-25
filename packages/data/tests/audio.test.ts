import { describe, expect, it } from 'vitest';
import {
  ayahAudioUrl,
  DEFAULT_RECITER_ID,
  RECITERS,
  reciterById,
} from '../src/audio.js';

describe('reciters', () => {
  it('excludes Alafasy', () => {
    // Owner ruling, umbrella decision 37. Alafasy is the default in most Quran
    // apps and in the design mockup, so this is exactly the entry a later
    // "helpful" edit adds back.
    const text = JSON.stringify(RECITERS).toLowerCase();
    expect(text).not.toContain('alafasy');
    expect(text).not.toContain('afasy');
  });

  it('defaults to Husary', () => {
    expect(DEFAULT_RECITER_ID).toBe('husary');
    expect(reciterById(DEFAULT_RECITER_ID)?.folder).toBe('Husary_64kbps');
  });

  it('has unique ids and folders', () => {
    expect(new Set(RECITERS.map((r) => r.id)).size).toBe(RECITERS.length);
    expect(new Set(RECITERS.map((r) => r.folder)).size).toBe(RECITERS.length);
  });

  it('offers between eight and twelve reciters', () => {
    expect(RECITERS.length).toBeGreaterThanOrEqual(8);
    expect(RECITERS.length).toBeLessThanOrEqual(12);
  });

  // The folder is a URL path segment, so an entry carrying a slash or a dot
  // segment would walk off the audio host no matter how well the lookup is
  // guarded. Checked against the table itself, since the table is the
  // allowlist -- this is the assertion that catches a bad row being added.
  it('keeps every folder a plain path segment', () => {
    for (const reciter of RECITERS) {
      expect(reciter.folder).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(reciter.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('returns null for an id it does not know', () => {
    expect(reciterById('nobody')).toBeNull();
    expect(reciterById('')).toBeNull();
  });
});

describe('ayahAudioUrl', () => {
  it('zero-pads both coordinates to three digits', () => {
    expect(ayahAudioUrl(1, 1)).toBe('https://everyayah.com/data/Husary_64kbps/001001.mp3');
    expect(ayahAudioUrl(2, 255)).toBe('https://everyayah.com/data/Husary_64kbps/002255.mp3');
    expect(ayahAudioUrl(114, 6)).toBe('https://everyayah.com/data/Husary_64kbps/114006.mp3');
  });

  it('builds a per-ayah url for the named reciter', () => {
    expect(ayahAudioUrl(2, 255, 'sudais'))
      .toBe('https://everyayah.com/data/Abdurrahmaan_As-Sudais_64kbps/002255.mp3');
  });

  it('refuses a reciter it does not know', () => {
    // The trust boundary. This value comes from a persisted setting, so a
    // corrupted or hand-edited row must not be able to steer the path -- and
    // '../..' as a folder is a directory traversal against the audio host.
    for (const bad of ['', '../..', 'alafasy', 'Husary_64kbps', 'husary ']) {
      expect(() => ayahAudioUrl(2, 255, bad)).toThrow(RangeError);
    }
  });

  // The result is handed straight to a media player, so a coordinate that is
  // not a plain in-range integer must never reach the path.
  it('refuses a coordinate that could steer the path', () => {
    expect(() => ayahAudioUrl(0, 1)).toThrow(RangeError);
    expect(() => ayahAudioUrl(115, 1)).toThrow(RangeError);
    expect(() => ayahAudioUrl(1, 0)).toThrow(RangeError);
    expect(() => ayahAudioUrl(1, 287)).toThrow(RangeError);
    expect(() => ayahAudioUrl(1.5, 1)).toThrow(RangeError);
    expect(() => ayahAudioUrl(1, Number.NaN)).toThrow(RangeError);
    expect(() => ayahAudioUrl('1/../..' as unknown as number, 1)).toThrow(RangeError);
  });

  it('still validates the coordinates for a named reciter', () => {
    expect(() => ayahAudioUrl(0, 1, 'husary')).toThrow(RangeError);
    expect(() => ayahAudioUrl(1, 999, 'husary')).toThrow(RangeError);
  });
});
