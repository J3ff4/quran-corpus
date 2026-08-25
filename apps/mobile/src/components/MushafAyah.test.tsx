import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return {
    ...reactNativeTextMock(),
    // AyahMedallion scales its box with the system font size.
    useWindowDimensions: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
  };
});
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ arabicScale: 'medium', reduceMotion: false, uiLocale: 'en' }),
}));

import { MushafAyah } from './MushafAyah';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

const ARABIC = 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ';
const TRANSLATION = 'Allah - there is no deity except Him';

function renderAyah(props: Partial<React.ComponentProps<typeof MushafAyah>> = {}) {
  const handlers = {
    onToggleBookmark: vi.fn(),
    onToggleAudio: vi.fn(),
    onWordPress: vi.fn(),
  };
  const result = render(
    <ThemeContext.Provider value={themeColors.dark}>
      <MushafAyah
        surahId={2}
        ayahNumber={255}
        arabicText={ARABIC}
        words={[]}
        bookmarked={false}
        playing={false}
        uiLocale="en"
        {...handlers}
        {...props}
      />
    </ThemeContext.Provider>,
  );
  return { ...handlers, ...result };
}

describe('MushafAyah', () => {
  afterEach(cleanup);

  it('renders the Arabic without a translation block', () => {
    // Mushaf mode is the *reason* the mode chip exists. A renderer that still
    // draws the translation is translation mode with different padding -- so
    // this component takes no translation prop at all, and the assertion is
    // that the reader's translation text cannot reach the screen through it.
    const { container } = renderAyah();

    expect(container.textContent).toContain(ARABIC);
    expect(container.textContent).not.toContain(TRANSLATION);
  });

  it('keeps the ayah medallion reachable as a control', () => {
    renderAyah();

    expect(screen.getByLabelText(/Ayah 255/)).toBeTruthy();
  });

  it('still marks a bookmarked ayah', () => {
    renderAyah({ bookmarked: true });

    expect(screen.getByTestId('ayah-2-255-bookmark').getAttribute('aria-selected')).toBe('true');
  });

  it('toggles the bookmark and playback for its own ayah', () => {
    // The ayah number, not a hardcoded one: a renderer that reports the wrong
    // ayah bookmarks a verse the user never touched.
    const { onToggleBookmark, onToggleAudio } = renderAyah({ ayahNumber: 255 });

    fireEvent.click(screen.getByTestId('ayah-2-255-bookmark'));
    expect(onToggleBookmark).toHaveBeenCalledWith(255);

    fireEvent.click(screen.getByTestId('ayah-2-255-audio'));
    expect(onToggleAudio).toHaveBeenCalledWith(255);
  });

  it('leaves the audio control inert and says so when audio is unconfigured', () => {
    const { onToggleAudio } = renderAyah({ audioDisabled: true });

    const audio = screen.getByTestId('ayah-2-255-audio');
    expect(audio.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(audio);
    expect(onToggleAudio).not.toHaveBeenCalled();
  });
});
