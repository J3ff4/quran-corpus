import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArabicScale } from './tokens';
import { useArabicSizes } from './useArabicSizes';

const mocks = vi.hoisted(() => ({
  settings: { arabicScale: 'medium' as ArabicScale },
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => mocks.settings,
}));

describe('useArabicSizes', () => {
  beforeEach(() => {
    mocks.settings = { arabicScale: 'medium' };
  });

  it('scales every Arabic size by the stored step', () => {
    mocks.settings.arabicScale = 'small';
    const { result } = renderHook(() => useArabicSizes());

    expect(result.current.reader).toBe(Math.round(28 * 0.8));
    expect(result.current.title).toBe(Math.round(36 * 0.8));
    expect(result.current.banner).toBe(Math.round(28 * 0.8));
  });

  it('leaves the tokens alone at the medium step', () => {
    const { result } = renderHook(() => useArabicSizes());

    expect(result.current.reader).toBe(28);
    expect(result.current.title).toBe(36);
  });

  it('falls back to medium for a value the store does not recognise', () => {
    // The setting is a string in SQLite. A row edited by hand, or written by an
    // older build, must not produce NaN as a font size -- RN throws on that.
    mocks.settings.arabicScale = 'enormous' as ArabicScale;
    const { result } = renderHook(() => useArabicSizes());

    expect(result.current.reader).toBe(28);
  });

  it('falls back to medium when the setting is missing entirely', () => {
    // Every component test in this app mocks useAppSettings with a partial
    // object, so an undefined step is the common case in-suite -- and the same
    // shape a build older than this setting would hydrate.
    mocks.settings = {} as { arabicScale: ArabicScale };
    const { result } = renderHook(() => useArabicSizes());

    expect(result.current.title).toBe(36);
  });
});
