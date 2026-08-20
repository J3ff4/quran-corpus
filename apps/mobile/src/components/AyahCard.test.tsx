import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AyahCard } from './AyahCard';

vi.mock('@/settings/settingsStore', () => ({
  // Not a provider: the real store pulls expo-sqlite into the jsdom module
  // graph, and every other component test here mocks it the same way. The
  // step only has to be one useArabicSizes recognises.
  useAppSettings: () => ({ arabicScale: 'medium' }),
}));

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');

  return {
    Pressable: host('button'),
    Text: host('span'),
    View: host('div'),
    useWindowDimensions: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
  };
});

const baseProps = {
  surahId: 2,
  // Empty is the reader's own starting state: words are fetched per ayah as
  // the list scrolls.
  words: [],
  onWordPress: () => {},
};

describe('AyahCard', () => {
  // This suite renders more than once and the project does not enable
  // testing-library's global auto-cleanup, so without this each case queries
  // the leftover DOM of the previous one.
  afterEach(cleanup);

  it('calls bookmark and audio handlers without exposing ayah text to callbacks', () => {
    const onToggleBookmark = vi.fn();
    const onToggleAudio = vi.fn();

    render(
      <AyahCard
        {...baseProps}
        ayahNumber={1}
        arabicText="Arabic text"
        translationText="Translation text"
        bookmarked={false}
        playing={false}
        uiLocale="en"
        onToggleBookmark={onToggleBookmark}
        onToggleAudio={onToggleAudio}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bookmark' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));

    expect(onToggleBookmark).toHaveBeenCalledWith(1);
    expect(onToggleAudio).toHaveBeenCalledWith(1);
  });

  it('announces the disabled audio control and the bookmarked state', () => {
    const onToggleAudio = vi.fn();

    render(
      <AyahCard
        {...baseProps}
        ayahNumber={255}
        arabicText="Arabic text"
        translationText="Translation text"
        bookmarked
        playing={false}
        uiLocale="en"
        audioDisabled
        onToggleBookmark={vi.fn()}
        onToggleAudio={onToggleAudio}
      />,
    );

    // Without accessibilityState this announced as an ordinary button whose
    // press does nothing.
    const play = screen.getByRole('button', { name: 'Play' });
    expect(play).toHaveProperty('ariaDisabled', 'true');
    expect(screen.getByRole('button', { name: 'Remove bookmark' })).toHaveProperty('ariaSelected', 'true');

    // Audio is live in shipped builds now, so this covers the disabled prop
    // rather than the default: a disabled Play must not fire the handler.
    fireEvent.click(play);
    expect(onToggleAudio).not.toHaveBeenCalled();
  });

  it('renders no basmala banner of its own before the words load', () => {
    // The banner used to hang off `ayahNumber === 1` here, while AyahText only
    // strips the basmala on the aligned path -- so every surah but 1 and 9
    // printed it twice, banner plus inline, until the ayah's words arrived.
    // AyahText owns the decision now; see its suite for the aligned case.
    const props = {
      ...baseProps,
      arabicText: 'Arabic text',
      translationText: null,
      bookmarked: false,
      playing: false,
      uiLocale: 'en' as const,
      onToggleBookmark: vi.fn(),
      onToggleAudio: vi.fn(),
    };

    const { rerender } = render(<AyahCard {...props} surahId={2} ayahNumber={1} />);
    expect(screen.queryByTestId('bismillah')).toBeNull();

    rerender(<AyahCard {...props} surahId={2} ayahNumber={2} />);
    expect(screen.queryByTestId('bismillah')).toBeNull();
  });

  it('still renders the Arabic when the reader has no words for the ayah', () => {
    // Words load per ayah as the list scrolls; a card that renders nothing
    // until they arrive flickers blank on every scroll.
    render(
      <AyahCard
        {...baseProps}
        ayahNumber={1}
        arabicText="Arabic text"
        translationText={null}
        bookmarked={false}
        playing={false}
        uiLocale="en"
        onToggleBookmark={vi.fn()}
        onToggleAudio={vi.fn()}
      />,
    );

    expect(screen.getByText('Arabic text')).toBeTruthy();
  });
});
