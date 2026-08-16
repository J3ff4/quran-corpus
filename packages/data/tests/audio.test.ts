import { describe, expect, it } from 'vitest';
import { ayahAudioUrl } from '../src/audio.js';

describe('ayahAudioUrl', () => {
  it('zero-pads both coordinates to three digits', () => {
    expect(ayahAudioUrl(1, 1)).toBe('https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/001001.mp3');
    expect(ayahAudioUrl(2, 255)).toBe('https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/002255.mp3');
    expect(ayahAudioUrl(114, 6)).toBe('https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/114006.mp3');
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
});
