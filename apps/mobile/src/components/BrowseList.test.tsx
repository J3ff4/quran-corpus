import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listPropsOf } from '@/testing/rnHosts';
import { BrowseList, chunk, GridCell, type BrowseItem } from './BrowseList';

// A mutable width behind useWindowDimensions, so the column tests below can
// move the window without a second `vi.mock('react-native', ...)` -- only one
// factory per mocked module is honoured, and everything else in this file
// already depends on the phone-width default `reactNativeTextMock` ships.
const win = vi.hoisted(() => ({ width: 390 }));

vi.mock('react-native', async () => ({
  ...(await import('@/testing/rnHosts.js')).reactNativeTextMock(),
  useWindowDimensions: () => ({ width: win.width, height: 844, scale: 3, fontScale: 1 }),
}));
// The rows squeeze on press, so they reach usePressScale -> useReducedMotion,
// which reads the in-app setting; the real store opens expo-secure-store.
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }) }));

function item(overrides: Partial<BrowseItem> = {}): BrowseItem {
  return {
    key: 'juz-1',
    leading: '1',
    title: 'Juz 1',
    accessibilityLabel: 'Juz 1',
    onPress: vi.fn(),
    ...overrides,
  };
}

/** The chevron's CSS transform. Read off the node rather than off the shared
 *  value: rnHosts folds RN's transform array into a string precisely so a
 *  rotation is assertable at all. */
function rotationOf(testID: string) {
  return screen.getByTestId(testID).style.transform;
}

/** Every glass card in the render. A card is the thing with a shadow, which
 *  the shim folds into boxShadow for exactly this kind of assertion. */
function cards() {
  return Array.from(screen.getByTestId('browse-list-root').querySelectorAll('*')).filter(
    (node) => (node as HTMLElement).style.boxShadow !== '',
  );
}

afterEach(() => {
  win.width = 390;
  cleanup();
});

describe('BrowseList disclosure rows', () => {
  it('draws no chevron on a row that is not a disclosure', () => {
    render(<BrowseList items={[item()]} />);

    expect(screen.queryByTestId('browse-chevron-juz-1')).toBeNull();
  });

  it('turns the chevron as the curtain unrolls', () => {
    // One glyph that rotates, not two that swap: the chevron turning in step
    // with the card opening is what says THIS card opened, rather than that
    // unrelated rows arrived beneath it.
    const { rerender } = render(<BrowseList items={[item({ expanded: false })]} />);
    expect(rotationOf('browse-chevron-juz-1')).toBe('rotate(0deg)');

    rerender(<BrowseList items={[item({ expanded: true })]} />);
    // Twice: the turn is issued from an effect, which runs after the render
    // that reads the shared value, so the first commit still paints the old
    // angle. Until 2026-09-11 the shim handed back a FRESH box on every
    // render, seeded from the current prop -- so this passed without the
    // effect ever running, and would have passed with no effect at all.
    rerender(<BrowseList items={[item({ expanded: true })]} />);
    expect(rotationOf('browse-chevron-juz-1')).toBe('rotate(90deg)');
  });

  it('draws an expanded juz as one card, not as four', () => {
    // The children were sibling rows, each in its own GlassSurface with the
    // same shape as a juz card -- so an expanded juz read as four juz (owner
    // screenshot, 2026-09-11).
    render(
      <div data-testid="browse-list-root">
        <BrowseList
          items={[
            item({
              expanded: true,
              children: [
                item({ key: 'c1', testID: 'child-1', title: 'Al-Fatiha 1-7', accessibilityLabel: 'Al-Fatiha' }),
                item({ key: 'c2', testID: 'child-2', title: 'Al-Baqara 1-141', accessibilityLabel: 'Al-Baqara' }),
              ],
            }),
          ]}
        />
      </div>,
    );

    expect(within(screen.getByTestId('child-1')).getByText('Al-Fatiha 1-7')).toBeTruthy();
    expect(cards()).toHaveLength(1);
  });

  it('keeps a collapsed juz childless', () => {
    render(
      <BrowseList
        items={[
          item({
            expanded: false,
            children: [item({ key: 'c1', title: 'Al-Fatiha 1-7', accessibilityLabel: 'Al-Fatiha' })],
          }),
        ]}
      />,
    );

    expect(screen.queryByText('Al-Fatiha 1-7')).toBeNull();
  });

  it('opens the child a tap landed on, not the juz around it', () => {
    // The card's surface sits outside the disclosure Pressable for this
    // reason: wrapped inside it, every child tap is swallowed as a toggle and
    // the ranges become decoration.
    const onPress = vi.fn();
    const childPress = vi.fn();
    render(
      <BrowseList
        items={[
          item({
            expanded: true,
            onPress,
            children: [
              item({ key: 'c1', testID: 'child-1', title: 'Al-Fatiha 1-7', accessibilityLabel: 'Al-Fatiha', onPress: childPress }),
            ],
          }),
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId('child-1'));

    expect(childPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('leaves every other browse row in the reading face', () => {
    // Juz and page rows carry no arabicFace (revealed rows are surah rows and
    // draw the glyph, 2026-09-12). A default that reached these would put a
    // private-use surah-name font on ordinary Arabic text, which has no
    // glyphs for it -- tofu in two of the four browse modes.
    render(<BrowseList items={[item({ arabic: 'البقرة' })]} />);

    const arabic = screen.getByTestId('browse-arabic-juz-1');
    expect(arabic.style.fontFamily).not.toContain('SurahName');
    expect(arabic.textContent).toBe('البقرة');
  });

  it('announces the disclosure state to a screen reader', () => {
    render(<BrowseList items={[item({ expanded: false })]} />);

    // Without this a chevron is decoration: TalkBack reads the row as a plain
    // button and never says the ranges under it exist.
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
  });

  it('leaves aria-expanded off a row that opens something', () => {
    render(<BrowseList items={[item()]} />);

    // A surah row navigates; announcing it as collapsed would promise a
    // disclosure that is not there.
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBeNull();
  });
});

describe('BrowseList collapsible sections', () => {
  const section = {
    title: 'Meccan',
    count: 2,
    data: [item({ key: 'a', title: 'Al-Alaq', accessibilityLabel: 'Al-Alaq' })],
  };

  it('renders a plain header when the section is not collapsible', () => {
    render(<BrowseList sections={[{ title: 'Meccan', data: section.data }]} />);

    expect(screen.getByText('Al-Alaq')).toBeTruthy();
    expect(screen.queryByTestId('browse-section-Meccan')).toBeNull();
  });

  it('shows the count and toggles on press', () => {
    const onToggle = vi.fn();
    render(<BrowseList sections={[{ ...section, expanded: true, onToggle }]} />);

    expect(screen.getByText('2')).toBeTruthy();
    fireEvent.click(screen.getByTestId('browse-section-Meccan'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders no rows while the section is collapsed', () => {
    render(<BrowseList sections={[{ ...section, expanded: false, onToggle: vi.fn() }]} />);

    // The header survives its own collapse, or there is nothing to reopen.
    expect(screen.getByTestId('browse-section-Meccan')).toBeTruthy();
    expect(screen.queryByText('Al-Alaq')).toBeNull();
  });

  it('announces the section state to a screen reader', () => {
    render(<BrowseList sections={[{ ...section, expanded: false, onToggle: vi.fn() }]} />);

    expect(screen.getByTestId('browse-section-Meccan').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('BrowseList under an open keyboard', () => {
  // RN's default is `never`: the first tap on a row dismisses the keyboard and
  // never reaches the row. Nothing focused a keyboard over this list until the
  // surah picker put an autofocused filter above it -- and then every pick
  // took two taps. Asserted on both list kinds because both are reachable
  // from a filtered screen.
  it('lets the first tap through on a flat list', () => {
    const result = render(<BrowseList items={[item()]} />);
    expect(listPropsOf(result)['keyboardShouldPersistTaps']).toBe('handled');
  });

  it('lets the first tap through on a sectioned list', () => {
    const result = render(
      <BrowseList sections={[{ title: 'Meccan', data: [item({ key: 'a' })] }]} />,
    );
    expect(listPropsOf(result)['keyboardShouldPersistTaps']).toBe('handled');
  });
});

describe('BrowseList columns', () => {
  const sixItems: BrowseItem[] = Array.from({ length: 6 }, (_, i) =>
    item({
      key: `s${i + 1}`,
      leading: String(i + 1),
      title: `Surah ${i + 1}`,
      subtitle: '7 ayahs',
      accessibilityLabel: `Surah ${i + 1}`,
    }),
  );

  it('stays one column on a phone, with no cell width pinned', () => {
    // Compact must be byte-for-byte unchanged: the phone row has always
    // filled its parent, so a cell that pins a width here is the regression,
    // and a FlatList that still takes numColumns=1 renders identically to one
    // that never had the prop.
    const result = render(<BrowseList items={sixItems} />);
    expect(listPropsOf(result)['numColumns']).toBe(1);
    expect(listPropsOf(result)['columnWrapperStyle']).toBeUndefined();
    for (const cell of screen.getAllByTestId('grid-cell')) expect(cell.style.width).toBe('');
    expect(screen.getByText('Surah 1')).toBeTruthy();
  });

  it('flows into columns on a wide window', () => {
    // 1400dp with the 380dp measured minimum -> 3 columns. Asserted as the
    // formula's own number rather than merely >1: a regression to 2 columns
    // would still pass a loose ">1" check.
    win.width = 1400;
    const result = render(<BrowseList items={sixItems} />);
    expect(listPropsOf(result)['numColumns']).toBe(3);
    expect(listPropsOf(result)['columnWrapperStyle']).toEqual({ gap: 10 });
    // Every cell pinned to the same fitted width, not left to stretch.
    const widths = new Set(screen.getAllByTestId('grid-cell').map((cell) => cell.style.width));
    expect(widths.size).toBe(1);
    expect([...widths][0]).not.toBe('');
  });

  it('chunks a section into rows of N, keeping every item', () => {
    // SectionList has no numColumns, so the section arm builds its own rows.
    win.width = 1400;
    render(<BrowseList sections={[{ title: 'Juz 1', data: sixItems }]} />);
    expect(screen.getAllByTestId('grid-cell')).toHaveLength(6);
    expect(screen.getAllByTestId('browse-row')).toHaveLength(2);
  });

  it('pads a short final row so its cells keep the column width', () => {
    // Without a spacer the last row's single card stretches to the full
    // width and reads as a different, larger card.
    win.width = 1400;
    render(<BrowseList sections={[{ title: 'Juz 1', data: sixItems.slice(0, 4) }]} />);
    const rows = screen.getAllByTestId('browse-row');
    expect(rows).toHaveLength(2);
    expect(screen.getAllByTestId('browse-row-spacer')).toHaveLength(2);
  });
});

describe('chunk', () => {
  it('keeps every item, the final row short rather than padded', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('gives every item its own row at one column', () => {
    expect(chunk(['a', 'b', 'c'], 1)).toEqual([['a'], ['b'], ['c']]);
  });
});

describe('GridCell', () => {
  it('sets no width style when width is undefined', () => {
    render(<GridCell width={undefined}>{'child'}</GridCell>);
    expect(screen.getByTestId('grid-cell').style.width).toBe('');
  });

  it('pins the width when given one', () => {
    render(<GridCell width={200}>{'child'}</GridCell>);
    expect(screen.getByTestId('grid-cell').style.width).toBe('200px');
  });

  it('clips a pinned cell so a swipe cannot cross into the next column', () => {
    // A Swipeable translates its card sideways. Unclipped, the bookmark card
    // in the middle column slid straight over the card beside it (device
    // check 507, vc77) -- the neighbour did not move, it was painted on.
    render(<GridCell width={200}>{'child'}</GridCell>);
    expect(screen.getByTestId('grid-cell').style.overflow).toBe('hidden');
  });

  it('leaves a single column unclipped, so the phone keeps its card shadow', () => {
    // The clip above is a tablet fix and the phone has no neighbour to cross;
    // clipping there would cost the card's shadow on a surface that must not
    // change.
    render(<GridCell width={undefined}>{'child'}</GridCell>);
    expect(screen.getByTestId('grid-cell').style.overflow).toBe('');
  });
});
