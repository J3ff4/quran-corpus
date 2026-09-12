import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
    onChangeShowTranslation: vi.fn(),
  };
  render(
    <ThemeContext.Provider value={themeColors.dark}>
      <ReaderHeader
        surahName="Al-Baqarah"
        uiLocale="en"
        {...handlers}
        {...props}
      />
    </ThemeContext.Provider>,
  );
  return handlers;
}

/** The three actions live in a curtain now (ruling R1): the button that
 *  unrolls it is the only way to reach them, on the device and here. */
function openActions() {
  fireEvent.click(screen.getByTestId('reader-actions'));
}

describe('ReaderHeader', () => {
  afterEach(cleanup);

  it('navigates rather than switching rendering for word-by-word', () => {
    // Decision 17: both WBW doors reach one screen. Rendering it inline would
    // be a second word-by-word implementation to keep in step, and persisting
    // it would reopen the app onto a screen the user left by pressing back.
    const { onOpenWbw } = renderHeader();

    fireEvent.click(screen.getByText('Words'));

    expect(onOpenWbw).toHaveBeenCalledTimes(1);
  });

  it('offers the translation and the door beside it, and no mushaf chip', () => {
    // M7d ruling 2: the mushaf is a tab now. A chip that switched a rendering
    // this reader no longer has would be a control leading nowhere.
    renderHeader();

    expect(screen.getByTestId('segment-translation').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('segment-wbw')).toBeTruthy();
    expect(screen.queryByTestId('segment-mushaf')).toBeNull();
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
    openActions();

    fireEvent.click(screen.getByTestId('open-language'));
    expect(onOpenLanguage).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText('Search'));
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
  });

  it('switches the translation off and back on', () => {
    const { onChangeShowTranslation } = renderHeader({ showTranslation: true });
    openActions();

    fireEvent.click(screen.getByTestId('toggle-translation'));

    expect(onChangeShowTranslation).toHaveBeenCalledWith(false);
  });

  it('says whether the translation is on, not just that a control exists', () => {
    // A switch whose only difference is which handler argument it sends tells
    // a screen reader nothing about the state it is in.
    renderHeader({ showTranslation: false });
    openActions();

    expect(screen.getByTestId('toggle-translation').getAttribute('aria-checked')).toBe('false');
  });

  it('keeps the language control when the translation is off', () => {
    // It used to be hidden here, on the rule that a picker changing nothing
    // visible is a dead control (owner reversed it, 2026-09-12). A control
    // that vanishes reflows the row under the thumb mid-tap.
    renderHeader({ showTranslation: false });
    openActions();

    expect(screen.getByTestId('open-language')).toBeTruthy();
    expect(screen.getByTestId('toggle-translation')).toBeTruthy();
  });

  it('turns the translation on when a language is picked while it is off', () => {
    // What keeps the control above from being the dead one the old rule
    // warned about: the language chosen is visible the moment it is chosen.
    const { onChangeShowTranslation, onOpenLanguage } = renderHeader({ showTranslation: false });
    openActions();

    fireEvent.click(screen.getByTestId('open-language'));

    expect(onChangeShowTranslation).toHaveBeenCalledWith(true);
    expect(onOpenLanguage).toHaveBeenCalledTimes(1);
  });

  it('does not re-assert the translation when it is already on', () => {
    const { onChangeShowTranslation } = renderHeader({ showTranslation: true });
    openActions();

    fireEvent.click(screen.getByTestId('open-language'));

    expect(onChangeShowTranslation).not.toHaveBeenCalled();
  });

  it('names the surah in the bar for a screen reader even while it is faded out', () => {
    // The name is always mounted and animated to opacity 0; hiding it from the
    // tree instead would take the surah name away from TalkBack for the whole
    // top of the surah.
    renderHeader({ titleStyle: { opacity: 0 } });

    expect(screen.getByTestId('reader-title').textContent).toBe('Al-Baqarah');
  });

  it('opens the jump sheet from the surah name', () => {
    const onOpenJump = vi.fn();
    renderHeader({ titleVisible: true, onOpenJump });

    fireEvent.click(screen.getByTestId('reader-surah-jump'));

    expect(onOpenJump).toHaveBeenCalledTimes(1);
  });

  it('still announces the surah name now that the name is a control', () => {
    // A Pressable is `accessible` by default and collapses its descendants, so
    // the Animated.Text is no longer announced and the label is the whole
    // utterance. Left as the action alone, wrapping the name in a control took
    // the surah name away from TalkBack entirely.
    renderHeader({ titleVisible: true, onOpenJump: vi.fn() });

    expect(screen.getByTestId('reader-surah-jump').getAttribute('aria-label')).toBe(
      'Al-Baqarah, Go to surah',
    );
  });

  it('does not take a tap while the name is faded out', () => {
    // The name is animated to opacity 0 until the list's own heading scrolls
    // off (M7e). A control that still takes presses there is an invisible hit
    // target across the middle of the header, and the surah name is legible in
    // the list heading at exactly that moment anyway.
    const onOpenJump = vi.fn();
    renderHeader({ titleVisible: false, titleStyle: { opacity: 0 }, onOpenJump });

    fireEvent.click(screen.getByTestId('reader-surah-jump'));

    expect(onOpenJump).not.toHaveBeenCalled();
  });

  it('hides the faded name from TalkBack rather than offering a dead control', () => {
    renderHeader({ titleVisible: false, titleStyle: { opacity: 0 }, onOpenJump: vi.fn() });

    expect(screen.getByTestId('reader-surah-jump').getAttribute('data-hidden-from-a11y')).toBe('true');
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
  it('gives the surah name a row of its own', () => {
    // Seven controls in a 390pt row left the name ~34pt -- 'Al-B...' on the
    // device (owner screenshot, 2026-09-11). The chevrons moved down to the
    // pill row; only back and the actions button share row 1 now.
    renderHeader({ prevSurahId: 1, nextSurahId: 3, onPageSurah: vi.fn() });

    // From the jump control, not the title: the name sits inside a Pressable
    // now (ruling S3), so the title's own parent is that control rather than
    // the row.
    const row = screen.getByTestId('reader-surah-jump').parentElement!;
    expect(within(row).queryByTestId('surah-previous')).toBeNull();
    expect(within(row).queryByTestId('surah-next')).toBeNull();
    expect(within(row).queryByTestId('reader-back')).not.toBeNull();
    expect(within(row).queryByTestId('reader-actions')).not.toBeNull();
  });

  it('keeps the surah chevrons beside the mode pill', () => {
    // Ruling R2. They page the surah and this is the row with width to spare.
    renderHeader({ prevSurahId: 1, nextSurahId: 3, onPageSurah: vi.fn() });

    const row = screen.getByTestId('reader-mode-row');
    expect(within(row).queryByTestId('surah-previous')).not.toBeNull();
    expect(within(row).queryByTestId('surah-next')).not.toBeNull();
  });

  it('hides the three actions until the actions button is pressed', () => {
    // Ruling R4: an inline expanding row, not a sheet -- nothing covers the
    // verses, and the row is part of the same glass surface.
    renderHeader();
    expect(screen.queryByTestId('toggle-translation')).toBeNull();
    expect(screen.queryByTestId('open-language')).toBeNull();
    expect(screen.queryByLabelText('Search')).toBeNull();

    openActions();

    expect(screen.queryByTestId('toggle-translation')).not.toBeNull();
    expect(screen.queryByTestId('open-language')).not.toBeNull();
    expect(screen.queryByLabelText('Search')).not.toBeNull();
  });

  it('draws a kebab, not the nav-drawer glyph', () => {
    // Three lines is Android's drawer icon everywhere else; on this button it
    // promised a drawer and opened an action row (owner, device,
    // 2026-09-11). Three dots is "more actions here". Asserted by path count,
    // which is also what catches a name with no entry in PATHS -- that
    // renders an empty <svg> rather than failing.
    renderHeader();
    expect(screen.getByTestId('reader-actions').querySelectorAll('path')).toHaveLength(3);

    openActions();

    // Two strokes: the close cross.
    expect(screen.getByTestId('reader-actions').querySelectorAll('path')).toHaveLength(2);
  });

  it('says what the actions button will do', () => {
    // A disclosure whose only cue is its glyph tells TalkBack nothing about
    // the state it is in.
    renderHeader();

    expect(screen.getByTestId('reader-actions').getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByTestId('reader-actions').getAttribute('aria-label')).toBe('More actions');

    openActions();

    expect(screen.getByTestId('reader-actions').getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('reader-actions').getAttribute('aria-label')).toBe('Hide actions');
  });

  it('strikes the translation switch through when it is off', () => {
    // Colour alone is not a state (WCAG 1.4.1): OFF is the same A-plus-CJK
    // mark with a slash across it, so the extra path IS the state, and it is
    // the one thing a colour swap cannot fake.
    renderHeader({ showTranslation: true });
    openActions();
    expect(screen.getByTestId('toggle-translation').querySelectorAll('path')).toHaveLength(6);

    cleanup();

    renderHeader({ showTranslation: false });
    openActions();
    expect(screen.getByTestId('toggle-translation').querySelectorAll('path')).toHaveLength(7);
  });

  it('never lets the mode pill settle on the word-by-word door', () => {
    // The reader's 'Words' navigates; it is not a rendering this screen has,
    // so the wash must not park on it (owner, device, 2026-09-11).
    const { onOpenWbw } = renderHeader();

    fireEvent.click(screen.getByTestId('segment-wbw'));

    expect(onOpenWbw).toHaveBeenCalled();
    expect(screen.getByTestId('segment-translation').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('segment-wbw').getAttribute('aria-selected')).toBe('false');
  });
});
