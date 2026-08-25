import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SurahList } from './SurahList';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
// SurahList renders BrowseList rows, whose press squeeze reads the in-app
// reduce-motion setting; the real store opens expo-secure-store.
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }) }));

describe('SurahList', () => {
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
});
