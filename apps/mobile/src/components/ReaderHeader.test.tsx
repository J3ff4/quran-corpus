import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
// usePressScale -> useReducedMotion reads the in-app setting as well as the
// system one; the real store opens expo-secure-store, which jsdom has no
// counterpart for.
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }) }));

import { ReaderHeader, type ReaderHeaderProps } from './ReaderHeader';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

function renderHeader(props: Partial<ReaderHeaderProps> = {}) {
  const handlers = {
    onChangeMode: vi.fn(),
    onOpenWbw: vi.fn(),
    onOpenLanguage: vi.fn(),
    onOpenSearch: vi.fn(),
    onBack: vi.fn(),
  };
  render(
    <ThemeContext.Provider value={themeColors.dark}>
      <ReaderHeader
        surahName="Al-Baqarah"
        mode="translation"
        uiLocale="en"
        {...handlers}
        {...props}
      />
    </ThemeContext.Provider>,
  );
  return handlers;
}

describe('ReaderHeader', () => {
  afterEach(cleanup);

  it('reports the chosen mode', () => {
    const { onChangeMode } = renderHeader();

    fireEvent.click(screen.getByText('Mushaf'));

    expect(onChangeMode).toHaveBeenCalledWith('mushaf');
  });

  it('navigates rather than switching mode for word-by-word', () => {
    // Decision 17: both WBW doors reach one screen. Rendering a third mode
    // inline would be a second word-by-word implementation to keep in step,
    // and a persisted 'wbw' would reopen the app onto a screen the user left
    // by pressing back.
    const { onChangeMode, onOpenWbw } = renderHeader();

    fireEvent.click(screen.getByText('Words'));

    expect(onOpenWbw).toHaveBeenCalledTimes(1);
    expect(onChangeMode).not.toHaveBeenCalled();
  });

  it('marks the mode it was given, not the first segment', () => {
    renderHeader({ mode: 'mushaf' });

    expect(screen.getByTestId('segment-mushaf').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('segment-translation').getAttribute('aria-selected')).toBe('false');
  });

  it('carries the back affordance the native toolbar used to provide', () => {
    // This header replaces the native one, so nothing else on the screen has a
    // way back -- an omission here strands the reader.
    const { onBack } = renderHeader();

    fireEvent.click(screen.getByLabelText('Back'));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('keeps the search and language actions reachable', () => {
    const { onOpenSearch, onOpenLanguage } = renderHeader();

    fireEvent.click(screen.getByTestId('open-language'));
    expect(onOpenLanguage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Search'));
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('names the surah in the bar for a screen reader even while it is faded out', () => {
    // The name is always mounted and animated to opacity 0; hiding it from the
    // tree instead would take the surah name away from TalkBack for the whole
    // top of the surah.
    renderHeader({ titleStyle: { opacity: 0 } });

    expect(screen.getByTestId('reader-title').textContent).toBe('Al-Baqarah');
  });

  it('pages to the next surah', () => {
    const onPageSurah = vi.fn();
    renderHeader({ prevSurahId: 1, nextSurahId: 3, onPageSurah });

    fireEvent.click(screen.getByTestId('surah-next'));

    expect(onPageSurah).toHaveBeenCalledWith(3, 'next');
  });

  it('dims the chevron at the ends of the mushaf rather than hiding it', () => {
    const onPageSurah = vi.fn();
    renderHeader({ prevSurahId: null, nextSurahId: 2, onPageSurah });

    fireEvent.click(screen.getByTestId('surah-previous'));

    // D47: disabled, not hidden. An arrow that vanishes slides the other one
    // under the thumb, and TalkBack loses the control entirely.
    expect(onPageSurah).not.toHaveBeenCalled();
    expect(screen.getByTestId('surah-previous')).toBeTruthy();
    expect(screen.getByTestId('surah-next')).toBeTruthy();
  });

  it('draws no surah chevrons at all when the screen cannot page', () => {
    renderHeader();

    // The dictionary reaches this header through no path today, but a header
    // with two dead controls is worse than one without them.
    expect(screen.queryByTestId('surah-previous')).toBeNull();
  });
});
