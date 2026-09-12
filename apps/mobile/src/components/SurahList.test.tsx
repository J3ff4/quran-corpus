import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurahList } from './SurahList';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
// SurahList renders BrowseList rows, whose press squeeze reads the in-app
// reduce-motion setting; the real store opens expo-secure-store.
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }) }));

describe('SurahList', () => {
  // Without this each test's render stacks on the last one's, and any query
  // that matches more than one row throws "found multiple elements" -- which
  // is how this was noticed (2026-09-11). It was the only suite in the
  // component folder missing it.
  afterEach(cleanup);
  it('renders surah names and ayah counts', () => {
    render(
      <SurahList
        surahs={[
          { id: 1, nameArabic: 'الفاتحة', nameTranslit: 'Al-Fatihah', nameTranslation: 'The Opener', ayahCount: 7 },
        ]}
        uiLocale="en"
        onOpenSurah={vi.fn()}
      />,
    );

    expect(screen.getByText('Al-Fatihah')).toBeTruthy();
    expect(screen.getByText('The Opener · 7 ayahs')).toBeTruthy();
  });

  it('draws the surah name in the calligraphic face', () => {
    // Ruling S1. The face is the point: in the reading face this row shows
    // the same string every other Arabic run uses, and the surah index is the
    // one list where the name is a title rather than text to be read.
    render(
      <SurahList
        surahs={[
          { id: 1, nameArabic: 'الفاتحة', nameTranslit: 'Al-Fatihah', nameTranslation: 'The Opener', ayahCount: 7 },
        ]}
        uiLocale="en"
        onOpenSurah={vi.fn()}
      />,
    );

    const arabic = screen.getByTestId('browse-arabic-surah-1');
    // V4, not V2: V2 has no glyph for surah 102 and would draw a box on
    // At-Takathur. V4 covers all 114 (verified 2026-09-11, M7e spike).
    expect(arabic.style.fontFamily).toContain('SurahNameV4');
    // 0xE000 + 1 -- the glyph, not the name. A row still passing nameArabic
    // renders الفاتحة in a font with no glyph for it, which is tofu.
    expect(arabic.textContent).toBe(String.fromCodePoint(0xe001));
  });

  it('names the surah for a screen reader, not the glyph', () => {
    // A PUA codepoint announces as nothing at all, so the row's own label is
    // the only thing standing between TalkBack and an unnamed button.
    render(
      <SurahList
        surahs={[
          { id: 1, nameArabic: 'الفاتحة', nameTranslit: 'Al-Fatihah', nameTranslation: 'The Opener', ayahCount: 7 },
        ]}
        uiLocale="en"
        onOpenSurah={vi.fn()}
      />,
    );

    expect(screen.getByTestId('browse-surah-1').getAttribute('aria-label')).toBe('Al-Fatihah, 7 ayahs');
  });
});
