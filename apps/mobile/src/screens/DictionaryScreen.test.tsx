import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryScreen } from './DictionaryScreen';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  // Four roots, chosen so every Task 9 assertion below is reachable:
  // - ا has two roots (ابل, أرض via the hamza-seat fold) so cells[1] (ا) stays
  //   enabled and cells[0] (ء) stays disabled, which two pre-existing tests
  //   depend on.
  // - قول is the one root under ق, so filtering to ق isolates it, and its
  //   count (1722) and gloss ('to say') are each unique in the fixture, so the
  //   Latin/meaning search tests isolate it too.
  // - أرض is the one root a folded Arabic search ('ارض' -> 'أرض') isolates.
  // - رحم and ابل share a count, and are listed here in the order the tie must
  //   NOT come out in: the frequency order is sorted from the alphabetical one
  //   and leans on Array.sort being stable, so ا has to land before ر however
  //   the DB hands them over.
  rows: [
    { id: 7, root_buckwalter: 'rHm', root_arabic: 'رحم', occurrence_count: 339, gloss_blob: 'mercy' },
    { id: 2, root_buckwalter: 'Abl', root_arabic: 'ابل', occurrence_count: 339, gloss_blob: 'camel' },
    { id: 9, root_buckwalter: 'qwl', root_arabic: 'قول', occurrence_count: 1722, gloss_blob: 'to say' },
    { id: 4, root_buckwalter: 'ArD', root_arabic: 'أرض', occurrence_count: 9, gloss_blob: null },
  ] as unknown[],
}));

vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }) }));
vi.mock('expo-router', () => ({ router: { push: mocks.push } }));
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
  const { host, AccessibilityInfo } = await import('@/testing/rnHosts.js');

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
    // Every glass control on this screen squeezes on press, so they all reach
    // useReducedMotion, which reads this on mount.
    AccessibilityInfo,
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

/** Mounted, past the browse-roots query AND past the letter-availability one,
 *  returning the ق cell. The two are separate effects with separate await
 *  chains, so a single act() flush settles only one of them reliably: a test
 *  that clicks a letter cell before availability lands clicks a *disabled*
 *  cell, the filter never applies, and the assertion after it fails for a
 *  reason that has nothing to do with what it is testing. That raced about one
 *  run in three. */
async function renderLoadedWithLetters() {
  await renderLoaded();
  await waitFor(() => expect(screen.getAllByTestId('dictionary-row')).toHaveLength(4));
  const qaf = screen
    .getAllByTestId('alphabet-cell')
    .find((cell) => cell.getAttribute('aria-label') === 'ق')!;
  await waitFor(() => expect(qaf.getAttribute('aria-disabled')).toBe('false'));
  return qaf;
}

describe('DictionaryScreen', () => {
  beforeEach(() => {
    mocks.push.mockReset();
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

  it('ignores a meaning needle shorter than the floor', async () => {
    // `me` sits inside both `mercy` and `camel` and nowhere else in the
    // fixture. gloss_blob carries dictionary prose now, so a two-letter needle
    // through the meaning arm keeps most of the corpus; three characters is
    // where it starts filtering.
    render(<DictionaryScreen />);
    const box = await screen.findByTestId('dictionary-search');

    fireEvent.change(box, { target: { value: 'mer' } });
    expect(screen.getAllByTestId('dictionary-row')).toHaveLength(1);

    fireEvent.change(box, { target: { value: 'me' } });
    expect(screen.queryAllByTestId('dictionary-row')).toHaveLength(0);
  });

  it('ranks results by occurrence count while a query is running', async () => {
    // Alphabetical is the default sort and puts ابل (339) before قول (1722);
    // a query must invert that, because a match anywhere in the corpus is
    // useless if the root the reader meant is filed under the later letter.
    render(<DictionaryScreen />);

    fireEvent.change(await screen.findByTestId('dictionary-search'), { target: { value: 'l' } });

    const labels = screen.getAllByTestId('dictionary-row').map((r) => r.getAttribute('aria-label'));
    expect(labels).toHaveLength(2);
    expect(labels[0]).toContain('قول');
    expect(labels[1]).toContain('ابل');
  });

  it('labels the ranked pane "Most used", not a sort order', async () => {
    // "Frequent" read as a sort order next to Browse's own "By frequency" chip.
    await renderLoaded();
    expect(screen.getByTestId('segment-frequent').textContent).toBe('Most used');
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
    // Filter to ق first. قول is the only root under ق in the fixture.
    const qaf = await renderLoadedWithLetters();
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

  it('hides the sort toggle while a query is running, alongside the letter grid', async () => {
    // The query forces the frequency order, so an "Alphabetical" chip left
    // rendered `selected` would be describing an order the list is not in --
    // and tapping it would change nothing on screen.
    await renderLoaded();
    expect(screen.getByTestId('dictionary-sort-alpha')).toBeTruthy();

    fireEvent.change(screen.getByTestId('dictionary-search'), { target: { value: 'ارض' } });
    expect(screen.queryByTestId('dictionary-sort-alpha')).toBeNull();
    expect(screen.queryByTestId('dictionary-sort-freq')).toBeNull();

    // Back with the grid once the box empties; the preference was never touched.
    fireEvent.change(screen.getByTestId('dictionary-search'), { target: { value: '' } });
    expect(screen.getByTestId('dictionary-sort-alpha')).toBeTruthy();
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
    const qaf = await renderLoadedWithLetters();

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

  it('breaks a frequency tie in hijāʾī order, not in the order the DB returned', async () => {
    // The two orders are each sorted once when the payload lands, and the
    // frequency one is sorted FROM the alphabetical one rather than from the
    // raw rows -- Array.sort is stable, so equal counts keep the hijāʾī order
    // they arrive in. Sorting it from the raw rows instead would leave this
    // tie in DB order, which is why the fixture lists رحم first.
    await renderLoaded();

    fireEvent.click(screen.getByTestId('dictionary-sort-freq'));

    const rows = screen.getAllByTestId('dictionary-row');
    expect(rows[0]!.textContent).toContain('قول');
    expect(rows[1]!.textContent).toContain('ابل');
    expect(rows[2]!.textContent).toContain('رحم');
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

  it('counts what is on screen in the header, not the whole corpus', async () => {
    // D1 put the count in the slim bar, where it captions the list under it.
    // A fixed corpus total there disagrees with the list the moment a letter
    // or a query filters it, and disagrees silently.
    await renderLoaded();
    expect(screen.getByTestId('dictionary-count').textContent).toBe('Roots · 4');

    fireEvent.change(screen.getByTestId('dictionary-search'), { target: { value: 'ارض' } });

    expect(screen.getByTestId('dictionary-count').textContent).toBe('Roots · 1');
  });

  it('captions the ranked pane with its ordering, not a root count', async () => {
    // Nothing on the ranked pane is a root once the Lemmas or Verbs chip is
    // tapped, so the browse caption would be wrong there in two ways at once.
    await renderLoaded();

    fireEvent.click(screen.getByTestId('segment-frequent'));

    expect(screen.getByTestId('dictionary-count').textContent).toBe('By frequency');
  });

  it('hides the grid on the Frequent pane', async () => {
    await renderLoaded();

    fireEvent.click(screen.getByTestId('segment-frequent'));

    expect(screen.queryAllByTestId('alphabet-cell')).toHaveLength(0);
    expect(screen.getByTestId('segment-frequent').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('frequency-list')).toBeTruthy();
  });

  it('passes the selected chip down to the list', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId('segment-frequent'));

    fireEvent.click(screen.getByTestId('frequency-kind-verbs'));

    // The chip is the only thing that selects the query; a chip that only
    // repaints its own border is the failure this catches.
    expect(screen.getByTestId('frequency-list').getAttribute('data-kind')).toBe('verbs');
    expect(screen.getByTestId('frequency-kind-verbs').getAttribute('aria-selected')).toBe('true');
  });

  it('announces the chips as a labelled toolbar of buttons, not a radio group', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByTestId('segment-frequent'));

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
});
