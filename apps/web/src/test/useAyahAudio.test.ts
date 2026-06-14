import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Ayah } from '@quran-corpus/data';

// --- Audio mock ----------------------------------------------------------------
const mockPlay = vi.fn();
const mockPause = vi.fn();
let storedOnended: (() => void) | null = null;
let storedOnerror: (() => void) | null = null;
let mockSrc = '';
let mockCurrentTime = 0;

class MockAudio {
  get src() { return mockSrc; }
  set src(v: string) { mockSrc = v; }
  get currentTime() { return mockCurrentTime; }
  set currentTime(v: number) { mockCurrentTime = v; }
  play = mockPlay;
  pause = mockPause;
  set onended(fn: (() => void) | null) { storedOnended = fn; }
  set onerror(fn: (() => void) | null) { storedOnerror = fn; }
}

vi.stubGlobal('Audio', MockAudio);

// import AFTER stub so the module sees the stubbed global
const { useAyahAudio } = await import('../hooks/useAyahAudio');

// --- Fixtures ------------------------------------------------------------------
const ayahs: Ayah[] = [
  { id: 1, surah_id: 1, ayah_number: 1, text_uthmani: 'آ', text_simple: null, juz: 1, page: 1, audio_url: null },
  { id: 2, surah_id: 1, ayah_number: 2, text_uthmani: 'بَ', text_simple: null, juz: 1, page: 1, audio_url: null },
  { id: 3, surah_id: 1, ayah_number: 3, text_uthmani: 'تَ', text_simple: null, juz: 1, page: 1, audio_url: null },
];

const a0 = ayahs[0]!;
const a1 = ayahs[1]!;
const a2 = ayahs[2]!;

// -------------------------------------------------------------------------------
describe('useAyahAudio', () => {
  beforeEach(() => {
    mockPlay.mockClear().mockResolvedValue(undefined);
    mockPause.mockClear();
    mockSrc = '';
    mockCurrentTime = 0;
    storedOnended = null;
    storedOnerror = null;
  });

  it('initialises with no playing ayah, not playing, not repeating', () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    expect(result.current.playingAyahId).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isRepeat).toBe(false);
  });

  it('play() sets playingAyahId, isPlaying=true, and correct MP3 URL', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(a0); });
    expect(result.current.playingAyahId).toBe(1);
    expect(result.current.isPlaying).toBe(true);
    expect(mockSrc).toBe(
      'https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/001001.mp3',
    );
  });

  it('play() on a different ayah changes src and playingAyahId', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(a0); });
    await act(async () => { result.current.play(a1); });
    expect(result.current.playingAyahId).toBe(2);
    expect(mockSrc).toBe(
      'https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/001002.mp3',
    );
  });

  it('pause() sets isPlaying=false and calls audio.pause()', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(a0); });
    act(() => { result.current.pause(); });
    expect(result.current.isPlaying).toBe(false);
    expect(mockPause).toHaveBeenCalledOnce();
  });

  it('toggleRepeat() flips isRepeat', () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    act(() => { result.current.toggleRepeat(); });
    expect(result.current.isRepeat).toBe(true);
    act(() => { result.current.toggleRepeat(); });
    expect(result.current.isRepeat).toBe(false);
  });

  it('onended without repeat advances to next ayah', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(a0); });
    await act(async () => { storedOnended?.(); });
    expect(result.current.playingAyahId).toBe(2);
    expect(mockSrc).toBe(
      'https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/001002.mp3',
    );
  });

  it('onended with repeat resets currentTime and replays same ayah', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(a0); });
    act(() => { result.current.toggleRepeat(); });
    mockPlay.mockClear();
    await act(async () => { storedOnended?.(); });
    expect(result.current.playingAyahId).toBe(1);
    expect(mockCurrentTime).toBe(0);
    expect(mockPlay).toHaveBeenCalledOnce();
  });

  it('onended on last ayah stops playback', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(a2); }); // index 2 = last
    await act(async () => { storedOnended?.(); });
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.playingAyahId).toBe(3); // id stays, but not playing
  });

  it('onerror sets isPlaying=false', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(a0); });
    act(() => { storedOnerror?.(); });
    expect(result.current.isPlaying).toBe(false);
  });

  it('play() on same ayah does not reset src (idempotent)', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(a0); });
    const srcAfterFirst = mockSrc;
    mockPlay.mockClear();
    await act(async () => { result.current.play(a0); }); // same ayah
    expect(mockSrc).toBe(srcAfterFirst); // src unchanged
    expect(mockPlay).toHaveBeenCalledOnce(); // play called again
  });

  it('play() rejection resets playingAyahId to prior value', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    mockPlay.mockRejectedValueOnce(new Error('autoplay blocked'));
    await act(async () => { result.current.play(a0); });
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.playingAyahId).toBeNull(); // reset to prior (null)
  });

  it('onended auto-advance keeps isPlaying=true', async () => {
    const { result } = renderHook(() => useAyahAudio(ayahs));
    await act(async () => { result.current.play(a0); });
    await act(async () => { storedOnended?.(); });
    expect(result.current.isPlaying).toBe(true); // still playing next ayah
    expect(result.current.playingAyahId).toBe(2);
  });

  it('play() uses ayah.audio_url when set, ignoring default URL', async () => {
    const customAyah: Ayah = { ...a0, audio_url: 'https://custom.cdn/001.mp3' };
    const { result } = renderHook(() => useAyahAudio([customAyah]));
    await act(async () => { result.current.play(customAyah); });
    expect(mockSrc).toBe('https://custom.cdn/001.mp3');
  });
});
