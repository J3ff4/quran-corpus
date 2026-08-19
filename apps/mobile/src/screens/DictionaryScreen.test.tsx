import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DictionaryScreen } from './DictionaryScreen';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  setOptions: vi.fn(),
  // ا and ر have roots; every other bucket is empty, ء included -- which is
  // the shipped DB's shape and the grid's first cell.
  rows: [
    { id: 2, root_buckwalter: 'Abl', root_arabic: 'ابل', occurrence_count: 2, gloss_blob: 'camel' },
    { id: 7, root_buckwalter: 'rHm', root_arabic: 'رحم', occurrence_count: 339, gloss_blob: 'mercy' },
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
  const { host } = await import('@/testing/rnHosts.js');
  return { Pressable: host('button'), Text: host('span'), View: host('div') };
});

/** Mounted and past the availability query, which every tap depends on. */
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

  it('opens on Browse and routes a tapped letter to its own screen', async () => {
    await renderLoaded();

    fireEvent.click(screen.getAllByTestId('alphabet-cell')[1]!);

    // The second cell is ا. Encoded, like every other Arabic path segment this
    // app builds -- an unencoded Arabic letter in a route is what parseLetterParam
    // would then have to un-guess.
    expect(mocks.push).toHaveBeenCalledWith(`/dictionary/letter/${encodeURIComponent('ا')}`);
  });

  it('enables only the letters roots are filed under, and none before they load', async () => {
    render(<DictionaryScreen />);

    // First paint: an all-enabled grid that dims a tick later is worse than a
    // grid that arrives ready.
    expect(screen.getAllByTestId('alphabet-cell')[1]!.getAttribute('aria-disabled')).toBe('true');

    await act(async () => {});
    const cells = screen.getAllByTestId('alphabet-cell');

    // ا has ابل; ء has nothing, and it is the cell a user reaches first.
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
