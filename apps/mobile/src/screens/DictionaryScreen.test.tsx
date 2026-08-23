import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryScreen } from './DictionaryScreen';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  setOptions: vi.fn(),
  // Four roots, chosen so every Task 9 assertion below is reachable:
  // - ا has two roots (ابل, أرض via the hamza-seat fold) so cells[1] (ا) stays
  //   enabled and cells[0] (ء) stays disabled, which two pre-existing tests
  //   depend on.
  // - قول is the one root under ق, so filtering to ق isolates it, and its
  //   count (1722) and gloss ('to say') are each unique in the fixture, so the
  //   Latin/meaning search tests isolate it too.
  // - أرض is the one root a folded Arabic search ('ارض' -> 'أرض') isolates.
  rows: [
    { id: 2, root_buckwalter: 'Abl', root_arabic: 'ابل', occurrence_count: 2, gloss_blob: 'camel' },
    { id: 7, root_buckwalter: 'rHm', root_arabic: 'رحم', occurrence_count: 339, gloss_blob: 'mercy' },
    { id: 9, root_buckwalter: 'qwl', root_arabic: 'قول', occurrence_count: 1722, gloss_blob: 'to say' },
    { id: 4, root_buckwalter: 'ArD', root_arabic: 'أرض', occurrence_count: 9, gloss_blob: null },
  ] as unknown[],
}));

vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));
vi.mock('expo-router', () => ({
  router: { push: mocks.push },
  useNavigation: () => ({ setOptions: mocks.setOptions }),
}));
vi.mock('@/components/icons/Icon', () => ({ Icon: () => null }));
vi.mock('@/components/FrequencyList', () => ({
  FrequencyList: ({ kind }: { kind: string }) =>
    React.createElement('div', { 'data-testid': 'frequency-list', 'data-kind': kind }),
}));
vi.mock('@/data/openCorpusDb', () => ({ openCorpusDb: () => Promise.resolve({}) }));
// The real getRootSearchList and rootFirstLetter run against this: the fold
// from a root's spelling to its bucket is the part worth exercising, and a
// mocked module would assert only that the screen calls something.
// Spread rather than replaced: the screen now reaches the fold through
// corpusRepository, which imports selectedTranslators from this same barrel,
// and a factory listing only createExpoSqliteClient makes that import undefined.
vi.mock('@quran-corpus/mobile-data', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createExpoSqliteClient: () => ({ execute: async () => ({ rows: mocks.rows }) }),
}));
vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');

  const Input = ({
    onChangeText,
    value,
    placeholder,
    accessibilityLabel,
    testID,
  }: {
    onChangeText?: (text: string) => void;
    value?: string;
    placeholder?: string;
    accessibilityLabel?: string;
    testID?: string;
  }) =>
    React.createElement('input', {
      'data-testid': testID,
      placeholder,
      'aria-label': accessibilityLabel,
      value: value ?? '',
      onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
    });

  // ListHeaderComponent/ListEmptyComponent arrive as already-built elements
  // here (both call sites pass JSX, not a component type), so they render
  // as-is rather than through createElement(Component).
  const List = ({
    data,
    renderItem,
    ListHeaderComponent,
    ListEmptyComponent,
    testID,
  }: {
    data: unknown[];
    renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
    ListHeaderComponent?: React.ReactNode;
    ListEmptyComponent?: React.ReactNode;
    testID?: string;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': testID },
      ListHeaderComponent ?? null,
      data.length === 0
        ? (ListEmptyComponent ?? null)
        : data.map((item, index) =>
            React.createElement('div', { key: index }, renderItem({ item, index })),
          ),
    );

  return {
    ActivityIndicator: () => React.createElement('span', { 'data-testid': 'spinner' }),
    FlatList: List,
    Pressable: host('button'),
    Text: host('span'),
    TextInput: Input,
    View: host('div'),
  };
});

/** Mounted and past both the availability query and the browse-roots query,
 *  which every Browse assertion depends on. */
async function renderLoaded() {
  render(<DictionaryScreen />);
  await act(async () => {});
}

describe('DictionaryScreen', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.setOptions.mockReset();
  });
  afterEach(cleanup);

  it('lists every root on Browse, without a letter tap', async () => {
    render(<DictionaryScreen />);

    expect(await screen.findAllByTestId('dictionary-row')).toHaveLength(4);
  });

  it('filters by letter in place, and clears on a second tap', async () => {
    render(<DictionaryScreen />);
    const qaf = (await screen.findAllByTestId('alphabet-cell')).find(
      (cell) => cell.getAttribute('aria-label') === 'ق',
    )!;

    fireEvent.click(qaf);

    expect(screen.getAllByTestId('dictionary-row')).toHaveLength(1);
    // .getAttribute, not the jest-dom toHaveAttribute matcher: jest-dom is an
    // apps/web dependency only (see InfoSheet.test.tsx).
    expect(qaf.getAttribute('aria-selected')).toBe('true');

    fireEvent.click(qaf);

    expect(screen.getAllByTestId('dictionary-row')).toHaveLength(4);
  });

  it('searches Arabic across hamza seats', async () => {
    // The stored root is أرض; a reader types ارض. Same fold searchRoots uses
    // server-side, so browse and search agree.
    render(<DictionaryScreen />);

    fireEvent.change(await screen.findByTestId('dictionary-search'), { target: { value: 'ارض' } });

    expect(screen.getAllByTestId('dictionary-row')).toHaveLength(1);
  });

  it('searches the Latin transliteration and the meaning', async () => {
    render(<DictionaryScreen />);
    const box = await screen.findByTestId('dictionary-search');

    fireEvent.change(box, { target: { value: 'qwl' } });
    expect(screen.getAllByTestId('dictionary-row')).toHaveLength(1);

    fireEvent.change(box, { target: { value: 'to say' } });
    expect(screen.getAllByTestId('dictionary-row')).toHaveLength(1);
  });

  it('labels the ranked pane "Most used", not a sort order', async () => {
    // "Frequent" read as a sort order next to Browse's own "By frequency" chip.
    await renderLoaded();
    expect(screen.getByTestId('dictionary-pane-frequent').textContent).toBe('Most used');
  });

  it('hides the alphabet grid while there is search text, and brings it back', async () => {
    // The grid lives in the list header, so on a phone it covers the first
    // results until the keyboard is dismissed and the list scrolled.
    await renderLoaded();
    const box = screen.getByTestId('dictionary-search');
    expect(screen.getAllByTestId('alphabet-cell').length).toBeGreaterThan(0);

    fireEvent.change(box, { target: { value: 'ا' } });
    expect(screen.queryAllByTestId('alphabet-cell')).toHaveLength(0);

    fireEvent.change(box, { target: { value: '' } });
    expect(screen.getAllByTestId('alphabet-cell').length).toBeGreaterThan(0);
  });

  it('searches the whole list while an active letter is only bypassed, not cleared', async () => {
    await renderLoaded();
    // Filter to ق first. قول is the only root under ق in the fixture.
    const qaf = screen
      .getAllByTestId('alphabet-cell')
      .find((cell) => cell.textContent === 'ق')!;
    fireEvent.click(qaf);
    expect(screen.getAllByTestId('dictionary-row')).toHaveLength(1);

    // A query for a root filed under a DIFFERENT letter still finds it.
    fireEvent.change(screen.getByTestId('dictionary-search'), { target: { value: 'ارض' } });
    expect(screen.getAllByTestId('dictionary-row').map((row) => row.textContent).join('')).toContain(
      'أرض',
    );

    // Emptying the box restores the ق filter -- it was never cleared.
    fireEvent.change(screen.getByTestId('dictionary-search'), { target: { value: '' } });
    expect(screen.getAllByTestId('dictionary-row')).toHaveLength(1);
  });

  it('clears the search box from the button, which only exists when there is text', async () => {
    await renderLoaded();
    const box = screen.getByTestId('dictionary-search');
    expect(screen.queryByTestId('dictionary-search-clear')).toBeNull();

    fireEvent.change(box, { target: { value: 'ارض' } });
    expect(screen.getAllByTestId('dictionary-row')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('dictionary-search-clear'));

    expect((screen.getByTestId('dictionary-search') as HTMLInputElement).value).toBe('');
    expect(screen.queryByTestId('dictionary-search-clear')).toBeNull();
    // The whole list is back, not the one-root result: the fixture has four
    // roots and 'ارض' isolates exactly one, so this tells cleared apart from
    // still-filtered. An assertion that passed either way would assert nothing.
    expect(screen.getAllByTestId('dictionary-row')).toHaveLength(4);
  });

  it('spins while the root list loads rather than claiming there are none', () => {
    // getAllRootsForBrowse is a 1642-row GROUP_CONCAT join. Rendering the
    // empty state for that stretch tells the reader the dictionary is empty,
    // which is indistinguishable from a broken build.
    render(<DictionaryScreen />);

    expect(screen.getByTestId('spinner')).toBeTruthy();
    expect(screen.queryByTestId('dictionary-empty')).toBeNull();
  });

  it('says so when nothing matched', async () => {
    // renderLoaded, not a bare render: before the roots land the empty slot is
    // a spinner, so a bare render would pass this whether or not the no-match
    // state exists.
    await renderLoaded();

    fireEvent.change(screen.getByTestId('dictionary-search'), { target: { value: 'zzzz' } });

    expect(screen.getByTestId('dictionary-empty')).toBeTruthy();
    expect(screen.queryByTestId('spinner')).toBeNull();
  });

  it('sorts by frequency and drops the letter filter with it', async () => {
    // Matches web: switching sort clears the letter, so the list the reader
    // sees is the whole corpus ordered by frequency, not one letter of it.
    render(<DictionaryScreen />);
    const qaf = (await screen.findAllByTestId('alphabet-cell')).find(
      (cell) => cell.getAttribute('aria-label') === 'ق',
    )!;

    // Prove the filter actually took effect before switching sort -- clicking
    // the disabled first cell (ء) would be a no-op and the assertion below
    // would pass whether or not sort actually clears the letter.
    fireEvent.click(qaf);
    expect(screen.getAllByTestId('dictionary-row')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('dictionary-sort-freq'));

    const rows = screen.getAllByTestId('dictionary-row');
    expect(rows).toHaveLength(4);
    expect(rows[0]!.textContent).toContain('1722');
  });

  it('keeps the search box out of the scrolling list', async () => {
    // A TextInput inside a FlatList header remounts on every render, so it
    // loses focus on every keystroke. It has to be a sibling of the list.
    render(<DictionaryScreen />);
    const list = await screen.findByTestId('dictionary-list');

    expect(list.contains(screen.getByTestId('dictionary-search'))).toBe(false);
  });

  it('enables only the letters roots are filed under, and none before they load', async () => {
    render(<DictionaryScreen />);

    // First paint: an all-enabled grid that dims a tick later is worse than a
    // grid that arrives ready.
    expect(screen.getAllByTestId('alphabet-cell')[1]!.getAttribute('aria-disabled')).toBe('true');

    await act(async () => {});
    const cells = screen.getAllByTestId('alphabet-cell');

    // ا has ابل and أرض (folded); ء has nothing, and it is the cell a user
    // reaches first.
    expect(cells[1]!.getAttribute('aria-disabled')).toBe('false');
    expect(cells[0]!.getAttribute('aria-disabled')).toBe('true');
  });

  it('hides the grid on the Frequent pane', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByTestId('dictionary-pane-frequent'));

    expect(screen.queryAllByTestId('alphabet-cell')).toHaveLength(0);
    expect(screen.getByTestId('dictionary-pane-frequent').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('frequency-list')).toBeTruthy();
  });

  it('passes the selected chip down to the list', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId('dictionary-pane-frequent'));

    fireEvent.click(screen.getByTestId('frequency-kind-verbs'));

    // The chip is the only thing that selects the query; a chip that only
    // repaints its own border is the failure this catches.
    expect(screen.getByTestId('frequency-list').getAttribute('data-kind')).toBe('verbs');
    expect(screen.getByTestId('frequency-kind-verbs').getAttribute('aria-selected')).toBe('true');
  });

  it('announces the chips as a labelled toolbar of buttons, not a radio group', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId('dictionary-pane-frequent'));

    // These are Material filter chips: buttons carrying a selected state.
    // `radiogroup` claims radio children they deliberately are not, and it was
    // the shipped role until 2d41084 -- which no test could have caught, since
    // nothing in this suite asserted a role at all.
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar.getAttribute('aria-label')).toBe('Filter by kind');
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    for (const kind of ['roots', 'lemmas', 'verbs']) {
      expect(screen.getByTestId(`frequency-kind-${kind}`).getAttribute('role')).toBe('button');
    }
    // The two pills above are the tabs. The chips filtering one list must not
    // also read as tabs, or TalkBack announces five tabs across two groupings.
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('puts a working search button in the header', async () => {
    await renderLoaded();

    const headerRight = mocks.setOptions.mock.calls
      .map(([options]) => options.headerRight)
      .filter(Boolean)
      .at(-1);
    // Rendered, not merely registered: `headerRight: expect.any(Function)`
    // passes just as well for a function returning null.
    render(headerRight());
    fireEvent.click(screen.getByTestId('open-search'));

    expect(mocks.push).toHaveBeenCalledWith('/search');
  });
});
