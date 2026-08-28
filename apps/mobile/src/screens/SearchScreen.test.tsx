import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEBOUNCE_MS, SearchScreen, SPINNER_DELAY_MS } from './SearchScreen';
import { deferred } from '../testing/deferred';

const mocks = vi.hoisted(() => ({
  searchCorpus: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', contentLanguage: 'ru', reduceMotion: false }),
}));
vi.mock('@/data/corpusRepository', () => ({ searchCorpus: mocks.searchCorpus }));
vi.mock('@/data/openCorpusDb', () => ({ openCorpusDb: () => Promise.resolve({}) }));
vi.mock('@quran-corpus/mobile-data', () => ({ createExpoSqliteClient: () => ({}) }));
vi.mock('expo-router', () => ({ router: { push: mocks.push } }));

vi.mock('react-native', async () => {
  const React = await import('react');
  const { host, AccessibilityInfo } = await import('@/testing/rnHosts.js');
  const Input = ({ onChangeText, value, placeholder, testID }: {
    onChangeText?: (text: string) => void;
    value?: string;
    placeholder?: string;
    testID?: string;
  }) =>
    React.createElement('input', {
      'data-testid': testID,
      placeholder,
      value: value ?? '',
      onChange: (event: { target: { value: string } }) => onChangeText?.(event.target.value),
    });
  return {
    // Every result card squeezes on press, so they reach useReducedMotion,
    // which reads this on mount.
    AccessibilityInfo,
    ActivityIndicator: host('div'),
    Pressable: host('button'),
    ScrollView: host('div'),
    Text: host('span'),
    TextInput: Input,
    View: host('div'),
  };
});

const EMPTY = { jump: null, verses: [], roots: [] };

// The debounce inside SearchScreen is 200ms; anything asserting "did not
// query" has to actually wait past it, or it is checking t=0, which is
// vacuously true whether or not the guard it is meant to cover exists.
const PAST_DEBOUNCE_MS = 300;
const settle = () => new Promise((resolve) => setTimeout(resolve, PAST_DEBOUNCE_MS));

describe('SearchScreen', () => {
  beforeEach(() => {
    mocks.searchCorpus.mockReset();
    mocks.push.mockReset();
    mocks.searchCorpus.mockResolvedValue(EMPTY);
  });

  afterEach(cleanup);

  it('shows the empty state before anything is typed', () => {
    render(<SearchScreen />);

    expect(screen.getByText('Type a verse reference, a word, or a root')).toBeTruthy();
  });

  it('never queries an empty box, even past the debounce window', async () => {
    render(<SearchScreen />);

    await settle();

    expect(mocks.searchCorpus).not.toHaveBeenCalled();
  });

  it('clears results and returns to the empty state when the box is cleared', async () => {
    mocks.searchCorpus.mockResolvedValue({
      jump: null,
      verses: [{ surah_id: 2, ayah_number: 255, source: 'ar', snippet: 'ٱللَّهُ' }],
      roots: [],
    });

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'x' } });
    await waitFor(() => expect(screen.getByTestId('search-verse')).toBeTruthy());

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '' } });

    // The old hit list and the "type something" hint on screen together is
    // the bug: a stale in-flight request repainting after the box emptied.
    await waitFor(() => expect(screen.getByText('Type a verse reference, a word, or a root')).toBeTruthy());
    expect(screen.queryByTestId('search-verse')).toBeNull();

    // Past the debounce window too: nothing queued for the cleared box should
    // still be in flight and land later.
    mocks.searchCorpus.mockClear();
    await settle();
    expect(mocks.searchCorpus).not.toHaveBeenCalled();
  });

  it('drops an in-flight request when the box is cleared before it lands', async () => {
    // The sibling test above races nothing: its request has already resolved
    // by the time it clears the box. Holding the promise open is what puts a
    // request genuinely in flight across the clear.
    let land!: (value: unknown) => void;
    mocks.searchCorpus.mockImplementation(
      () =>
        new Promise((resolve) => {
          land = resolve;
        }),
    );

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'x' } });

    await waitFor(() => expect(mocks.searchCorpus).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('search-loading')).toBeTruthy());

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '' } });
    await act(async () => {
      land({
        jump: null,
        verses: [{ surah_id: 2, ayah_number: 255, source: 'ar', snippet: '\u0671\u0644\u0644\u064e\u0651\u0647\u064f' }],
        roots: [],
      });
      await settle();
    });

    expect(screen.getByText('Type a verse reference, a word, or a root')).toBeTruthy();
    // Stale hits must not repaint under the empty state: that is the sequence
    // bump on the empty branch.
    expect(screen.queryByTestId('search-verse')).toBeNull();
    // ...and the bump orphans the request's own `finally`, so the empty branch
    // owes the spinner its own clear.
    expect(screen.queryByTestId('search-loading')).toBeNull();
  });

  it('searches in the reader content language, not the UI locale', async () => {
    render(<SearchScreen />);

    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'нет' } });

    await waitFor(() => expect(mocks.searchCorpus).toHaveBeenCalled());
    // Passing the UI locale here searches Russian text for a user reading in
    // English and returns nothing, which reads as a broken index.
    expect(mocks.searchCorpus.mock.calls.at(-1)![2]).toBe('ru');
  });

  it('renders a verse-reference jump above the hits', async () => {
    mocks.searchCorpus.mockResolvedValue({
      jump: {
        surah_id: 2,
        ayah_number: 255,
        text_uthmani: 'ٱللَّهُ',
        words: [],
        highlightPosition: null,
      },
      verses: [{ surah_id: 2, ayah_number: 255, source: 'ar', snippet: 'ٱللَّهُ' }],
      roots: [],
    });

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '2:255' } });

    await waitFor(() => expect(screen.getByTestId('search-verse')).toBeTruthy());
    expect(screen.getByTestId('search-jump').textContent).toContain('2:255');

    // Order, not just presence -- reordering the two sections must fail this.
    const testIds = Array.from(document.querySelectorAll('[data-testid]')).map((el) =>
      el.getAttribute('data-testid'),
    );
    const jumpIndex = testIds.indexOf('search-jump');
    const verseIndex = testIds.indexOf('search-verse');
    expect(jumpIndex).toBeGreaterThanOrEqual(0);
    expect(verseIndex).toBeGreaterThan(jumpIndex);
  });

  it('opens the surah at the ayah when the jump is tapped', async () => {
    mocks.searchCorpus.mockResolvedValue({
      jump: {
        surah_id: 2,
        ayah_number: 255,
        text_uthmani: 'ٱللَّهُ',
        words: [],
        highlightPosition: null,
      },
      verses: [],
      roots: [],
    });

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: '2:255' } });
    await waitFor(() => expect(screen.getByTestId('search-jump')).toBeTruthy());

    fireEvent.click(screen.getByTestId('search-jump'));

    expect(mocks.push).toHaveBeenCalledWith('/surah/2?ayah=255');
  });

  it('shows a surah-only jump without a fabricated ayah number', async () => {
    mocks.searchCorpus.mockResolvedValue({
      jump: {
        surah_id: 2,
        ayah_number: null,
        text_uthmani: '',
        words: [],
        highlightPosition: null,
      },
      verses: [],
      roots: [],
    });

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'Al-Baqarah' } });

    await waitFor(() => expect(screen.getByTestId('search-jump')).toBeTruthy());
    // Not '2:1' -- a surah-name match carries no ayah, and openJump pushes
    // the surah alone, so a fabricated ':1' would label a destination the
    // tap does not reach.
    expect(screen.getByTestId('search-jump').textContent).toBe('2');

    fireEvent.click(screen.getByTestId('search-jump'));
    expect(mocks.push).toHaveBeenCalledWith('/surah/2');
  });

  it('shows the no-results message when nothing matches', async () => {
    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'zzz-no-match' } });

    await waitFor(() => expect(screen.getByText('Nothing found')).toBeTruthy());
  });

  it('does not flash the no-results message before a query has run', async () => {
    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'z' } });

    // The verdict belongs to a finished query. Judging it from the box paints
    // "Nothing found" here, inside the debounce window, on every keystroke --
    // which is the flicker device check 33 caught.
    expect(screen.queryByText('Nothing found')).toBeNull();
    await waitFor(() => expect(screen.getByText('Nothing found')).toBeTruthy());
  });

  it('keeps the previous verdict on screen while the next query runs', async () => {
    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'zz' } });
    await waitFor(() => expect(screen.getByText('Nothing found')).toBeTruthy());

    // The next query has to be in flight, not merely debouncing: the old code
    // dropped the verdict the moment `loading` flipped, so an assertion made
    // inside the debounce window passes against the bug too.
    const inFlight = deferred<unknown>();
    mocks.searchCorpus.mockReturnValue(inFlight.promise);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'zzq' } });
    await waitFor(() => expect(mocks.searchCorpus).toHaveBeenCalledTimes(2));

    // Still there while it runs: blinking it out and back is the same flicker
    // seen from the other side.
    expect(screen.getByText('Nothing found')).toBeTruthy();

    await act(async () => {
      inFlight.resolve(EMPTY);
      await inFlight.promise;
    });
  });

  it('holds the spinner back until a query is actually slow', async () => {
    // Fake timers, because the interesting distance here is 300ms between two
    // events the test itself triggers. On a real clock a loaded machine can
    // arrive at the first assertion after the spinner has already fired.
    vi.useFakeTimers();
    try {
      const inFlight = deferred<unknown>();
      mocks.searchCorpus.mockReturnValue(inFlight.promise);

      render(<SearchScreen />);
      fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'x' } });

      // Debounce elapsed, query running -- and nothing painted. A local query
      // that answers in single-digit milliseconds must never show an indicator.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      });
      expect(mocks.searchCorpus).toHaveBeenCalled();
      expect(screen.queryByTestId('search-loading')).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(SPINNER_DELAY_MS - 1);
      });
      expect(screen.queryByTestId('search-loading')).toBeNull();

      // One millisecond later it is a slow query and the spinner is earned.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getByTestId('search-loading')).toBeTruthy();

      await act(async () => {
        inFlight.resolve(EMPTY);
        await inFlight.promise;
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a failed search instead of an empty result', async () => {
    mocks.searchCorpus.mockRejectedValue(new Error('no such module: fts5'));

    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'x' } });

    // R4: an FTS5 build problem must not look identical to an unmatched word,
    // or the first device run reports a data fault instead of a build one.
    await waitFor(() => expect(screen.getByText('Unable to search')).toBeTruthy());
  });

  it('labels each result kind distinctly, and gives each its own affordance', async () => {
    // Mockup 1i's whole point: three kinds, three affordances. Before this
    // they were three near-identical lists of rows under three headers that
    // differed only in wording.
    //
    // Three kinds, not the four the plan's draft test named: SearchResult
    // carries jump, verses and roots. There is no lemma/"Words" arm in the
    // data, and adding one is a packages/data query -- out of scope for M6g
    // by its own constraint, and a §5 trigger besides.
    mocks.searchCorpus.mockResolvedValue({
      jump: {
        surah_id: 2,
        ayah_number: 255,
        text_uthmani: '',
        words: [],
        highlightPosition: null,
      },
      verses: [{ surah_id: 1, ayah_number: 1, source: 'ar', snippet: 'bismi' }],
      roots: [{ id: 7, root_buckwalter: 'rHm', root_arabic: 'رحم', occurrence_count: 339 }],
    });
    render(<SearchScreen />);
    fireEvent.change(screen.getByTestId('search-input'), { target: { value: 'rHm' } });
    await act(async () => {
      await settle();
    });

    expect(screen.getAllByRole('header').map((header) => header.textContent)).toEqual([
      'GO TO',
      'VERSES',
      'ROOTS',
    ]);
    // Each kind reachable by its own testID, so a kind that silently stopped
    // rendering is a failure here rather than a header with nothing under it.
    expect(screen.getByTestId('search-jump')).toBeTruthy();
    expect(screen.getByTestId('search-verse')).toBeTruthy();
    expect(screen.getByTestId('search-root')).toBeTruthy();
    // The root row carries its occurrence count; the verse row carries its
    // reference. Neither used to show anything but the headword.
    expect(screen.getByTestId('search-root').textContent).toContain('339');
    expect(screen.getByTestId('search-verse').textContent).toContain('1:1');
  });
});
