import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConcordanceEntry } from '@quran-corpus/data/mobile';
import { deferred } from '@/testing/deferred';
import { rgb } from '@/testing/rgb';
import { themeColors } from '@/theme/tokens';
import { ConcordanceList } from './ConcordanceList';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));
vi.mock('expo-router', () => ({ router: { push: mocks.push } }));
vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  return {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    Pressable: host('button'),
    Text: host('span'),
    View: host('div'),
    // Exposes onEndReached as a button so a test can page without a viewport.
    // ListFooterComponent is rendered, not dropped: a prop a mock omits is a
    // prop no test in this file can ever see, and the mid-list failure notice
    // lives there (F1 -- the same class of hole that hid LemmaScreen's loadPage).
    FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, ListFooterComponent, onEndReached }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      ListHeaderComponent?: React.ReactNode;
      ListEmptyComponent?: React.ReactNode;
      ListFooterComponent?: React.ReactNode;
      onEndReached?: () => void;
    }) =>
      React.createElement(
        'div',
        null,
        ListHeaderComponent,
        React.createElement('button', { 'data-testid': 'end-reached', onClick: onEndReached }),
        data.length === 0
          ? ListEmptyComponent
          : data.map((item, index) =>
              React.createElement('div', { key: index }, renderItem({ item, index }))),
        ListFooterComponent,
      ),
  };
});

/** One occurrence. `verse_words` is the whole ayah; `word_id` names the match
 *  inside it, which is what trimConcordanceVerse centres the window on. */
function entry(surah: number, ayah: number, wordId = surah * 1000 + ayah) {
  return {
    surah_id: surah,
    ayah_number: ayah,
    position: 2,
    word_id: wordId,
    text_arabic: 'ٱلْغَيْبِ',
    transliteration: null,
    gloss: 'the unseen',
    form_id: null,
    verse_words: [
      { id: wordId - 1, position: 1, text_arabic: 'يُؤْمِنُونَ', starts_clause: false },
      { id: wordId, position: 2, text_arabic: 'ٱلْغَيْبِ', starts_clause: false },
      { id: wordId + 1, position: 3, text_arabic: 'وَيُقِيمُونَ', starts_clause: false },
    ],
  };
}

/** A full page (PAGE = 20). A short page means "exhausted", so any test about
 *  what happens *after* a page has to hand back a full one. */
function fullPage(startId = 3000) {
  return Array.from({ length: 20 }, (_, i) => entry(2, 3 + i, startId + i * 10));
}

/** The DOM of the first committed frame. A layout effect runs in the commit
 *  phase, before any passive effect, so this is what the eye actually sees
 *  before the mount effect gets to change anything -- which is the only place
 *  an empty-state flash is observable. */
function firstFrame(ui: React.ReactElement): string {
  let html = '';
  function Probe() {
    React.useLayoutEffect(() => {
      html = document.body.innerHTML;
    }, []);
    return null;
  }
  render(
    <>
      {ui}
      <Probe />
    </>,
  );
  return html;
}

describe('ConcordanceList', () => {
  const loadPage = vi.fn();

  beforeEach(() => {
    loadPage.mockReset();
    mocks.push.mockReset();
    loadPage.mockResolvedValue([entry(2, 3)]);
  });

  afterEach(cleanup);

  it('loads the first page on mount', async () => {
    render(<ConcordanceList total={60} loadPage={loadPage} header={<span />} />);

    await waitFor(() => expect(loadPage).toHaveBeenCalledWith(0, 20));
  });

  it('pages from the offset it has reached, not from zero', async () => {
    loadPage.mockResolvedValueOnce(fullPage());
    render(<ConcordanceList total={60} loadPage={loadPage} header={<span />} />);
    await waitFor(() => expect(screen.getAllByTestId('concordance-row')).toHaveLength(20));

    screen.getByTestId('end-reached').click();

    // Re-requesting offset 0 renders the same page again and never advances,
    // which looks exactly like a list that has finished loading.
    await waitFor(() => expect(loadPage).toHaveBeenCalledWith(20, 20));
  });

  it('stops paging once every occurrence is loaded', async () => {
    render(<ConcordanceList total={1} loadPage={loadPage} header={<span />} />);
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));

    screen.getByTestId('end-reached').click();
    screen.getByTestId('end-reached').click();

    expect(loadPage).toHaveBeenCalledTimes(1);
  });

  it('stops on a short page rather than probing for an empty one', async () => {
    // `total` can overstate what the query returns. A page short of the limit
    // is already the end -- asking again costs a round trip to learn nothing.
    loadPage.mockResolvedValue([entry(2, 3), entry(2, 4), entry(2, 5)]);
    render(<ConcordanceList total={60} loadPage={loadPage} header={<span />} />);
    await waitFor(() => expect(screen.getAllByTestId('concordance-row')).toHaveLength(3));

    screen.getByTestId('end-reached').click();
    screen.getByTestId('end-reached').click();

    expect(loadPage).toHaveBeenCalledTimes(1);
  });

  it('discards a page still in flight when the loader changes', async () => {
    // A content-language change swaps the loader under a mounted screen. The
    // superseded page must not append stale-language rows to the new list,
    // must not advance the new list's offset, and must not free the busy flag
    // out from under the request that is actually running.
    const inFlight = deferred<ConcordanceEntry[]>();
    const stale = vi.fn(() => inFlight.promise);
    const fresh = vi.fn().mockResolvedValue(fullPage(7000));

    const { rerender } = render(
      <ConcordanceList total={60} loadPage={stale} header={<span />} />,
    );
    await waitFor(() => expect(stale).toHaveBeenCalledTimes(1));

    rerender(<ConcordanceList total={60} loadPage={fresh} header={<span />} />);
    await waitFor(() => expect(screen.getAllByTestId('concordance-row')).toHaveLength(20));

    await act(async () => {
      inFlight.resolve([entry(9, 9, 9999)]);
      await inFlight.promise;
    });

    const labels = screen
      .getAllByTestId('concordance-row')
      .map((row) => row.getAttribute('aria-label') ?? '');
    expect(labels).toHaveLength(20);
    expect(labels.some((label) => label.startsWith('9:9'))).toBe(false);
    expect(labels[0]).toContain('2:3');

    // The live request still owns the offset: page two is 20, not 21.
    screen.getByTestId('end-reached').click();
    await waitFor(() => expect(fresh).toHaveBeenCalledWith(20, 20));
  });

  it('lets a superseded page settle without disturbing the live one', async () => {
    // Same swap as above, but the superseded page *fails* while the new one is
    // still in flight -- the two states the early return has to leave alone.
    const first = deferred<ConcordanceEntry[]>();
    const second = deferred<ConcordanceEntry[]>();
    const stale = vi.fn(() => first.promise);
    const fresh = vi.fn(() => second.promise);

    const { rerender } = render(
      <ConcordanceList total={60} loadPage={stale} header={<span />} />,
    );
    await waitFor(() => expect(stale).toHaveBeenCalledTimes(1));

    rerender(<ConcordanceList total={60} loadPage={fresh} header={<span />} />);
    await waitFor(() => expect(fresh).toHaveBeenCalledTimes(1));

    await act(async () => {
      first.reject(new Error('stale root'));
      await first.promise.catch(() => {});
    });

    // Releasing the busy flag here admits a third request alongside the one
    // still running, both writing the same list.
    screen.getByTestId('end-reached').click();
    expect(fresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      second.resolve(fullPage(7000));
      await second.promise;
    });
    await waitFor(() => expect(screen.getAllByTestId('concordance-row')).toHaveLength(20));

    // And the dead request's failure must not have stopped the live list's
    // paging by pinning its offset to `total`.
    screen.getByTestId('end-reached').click();
    await waitFor(() => expect(fresh).toHaveBeenCalledWith(20, 20));
  });

  it('drops an in-flight page when the new list has nothing to load', async () => {
    // The one swap loadMore cannot supersede by itself: it returns at the
    // offset guard before it can claim a generation, so the effect has to.
    const inFlight = deferred<ConcordanceEntry[]>();
    const stale = vi.fn(() => inFlight.promise);
    const empty = vi.fn();

    const { rerender } = render(
      <ConcordanceList total={60} loadPage={stale} header={<span />} />,
    );
    await waitFor(() => expect(stale).toHaveBeenCalledTimes(1));

    rerender(<ConcordanceList total={0} loadPage={empty} header={<span />} />);
    await act(async () => {
      inFlight.resolve([entry(9, 9, 9999)]);
      await inFlight.promise;
    });

    expect(screen.queryAllByTestId('concordance-row')).toHaveLength(0);
    // And the spinner has to give way: the superseded request's `finally` is
    // guarded, so it will never clear it.
    expect(screen.queryByTestId('concordance-status')?.textContent).toBe('No occurrences');
    expect(empty).not.toHaveBeenCalled();
  });

  it('does not flash the empty state before the first page arrives', () => {
    loadPage.mockReturnValue(new Promise(() => {}));

    const html = firstFrame(<ConcordanceList total={60} loadPage={loadPage} header={<span />} />);

    expect(html).not.toContain('concordance-status');
    expect(html).not.toContain('No occurrences');
  });

  it('says a root with no occurrences is empty on the first frame', () => {
    const html = firstFrame(<ConcordanceList total={0} loadPage={loadPage} header={<span />} />);

    expect(html).toContain('No occurrences');
  });

  it('shows the verse around the match, not the matched word alone', async () => {
    render(<ConcordanceList total={1} loadPage={loadPage} header={<span />} />);

    // Without the verse, every row on a root with 60 occurrences carries the
    // same Arabic word and the concordance is a list of verse numbers.
    await waitFor(() => expect(screen.getByTestId('concordance-verse')).toBeTruthy());
    const verse = screen.getByTestId('concordance-verse').textContent ?? '';
    expect(verse).toContain('يُؤْمِنُونَ');
    expect(verse).toContain('وَيُقِيمُونَ');
  });

  it('tints the matched word inside the verse', async () => {
    render(<ConcordanceList total={1} loadPage={loadPage} header={<span />} />);

    // The point of the verse is locating the match in it. Untinted, the reader
    // has to find the word by eye in a right-to-left run.
    await waitFor(() => expect(screen.getByTestId('concordance-match')).toBeTruthy());
    const match = screen.getByTestId('concordance-match');
    expect(match.textContent).toBe('ٱلْغَيْبِ');
    expect(match.style.color).not.toBe('');
    expect(match.style.color).not.toBe(
      screen.getByTestId('concordance-verse').style.color,
    );
    // Hue alone is ~1.26:1 against the surrounding muted text, so a colour-blind
    // reader gets no match at all. The wash is what carries the distinction.
    expect(match.style.backgroundColor).toBe(rgb(themeColors.light.accentWash));
    // Wash and tint are both colour, so WCAG 1.4.1 wants one signal that is
    // not. Weight is web's (font-semibold) on the same single-weight face.
    // Asserted against the verse's own weight so a globally bold verse -- which
    // would signal nothing -- cannot pass this.
    expect(match.style.fontWeight).toBe('700');
    expect(match.style.fontWeight).not.toBe(
      screen.getByTestId('concordance-verse').style.fontWeight,
    );
  });

  it('reads the verse out as part of the row', async () => {
    render(<ConcordanceList total={1} loadPage={loadPage} header={<span />} />);
    await waitFor(() => expect(screen.getByTestId('concordance-row')).toBeTruthy());

    // Pressable is one accessibility node and the label replaces its subtree,
    // so a label without the verse makes the Arabic unreachable to TalkBack.
    const label = screen.getByTestId('concordance-row').getAttribute('aria-label') ?? '';
    expect(label).toContain('يُؤْمِنُونَ');
    expect(label).toContain('وَيُقِيمُونَ');
    expect(label.startsWith('2:3, the unseen')).toBe(true);
  });

  it('opens the verse it names', async () => {
    render(<ConcordanceList total={1} loadPage={loadPage} header={<span />} />);
    await waitFor(() => expect(screen.getByTestId('concordance-row')).toBeTruthy());

    fireEvent.click(screen.getByTestId('concordance-row'));

    expect(mocks.push).toHaveBeenCalledWith('/surah/2?ayah=3');
  });

  it('says so when a page fails, rather than showing an empty list', async () => {
    loadPage.mockRejectedValue(new Error('no such table'));

    render(<ConcordanceList total={60} loadPage={loadPage} header={<span />} />);

    // "No occurrences" on a failed read is a lie, and a root that has none is
    // indistinguishable from a broken DB. Same finding as m-5. Asserted on the
    // status node's text, not on the alert role alone: a missing role only says
    // the query found nothing, where the text says which of the two it read as.
    await waitFor(() =>
      expect(screen.getByTestId('concordance-status').textContent).toBe(
        'Unable to load occurrences',
      ),
    );
    expect(screen.getByTestId('concordance-status').getAttribute('role')).toBe('alert');
    // The node appears after mount, so the role alone announces nothing --
    // TalkBack only speaks a subtree it was already watching.
    expect(screen.getByTestId('concordance-status').getAttribute('aria-live')).toBe('polite');
  });

  it('says so when a page fails after the first, not only on an empty list', async () => {
    // The empty state is unreachable once a page has landed, so a failure here
    // used to set `failed` with nowhere to render it: the list simply stopped
    // growing, which is exactly what reaching the end looks like. 40 of these
    // 60 occurrences are now unreachable and the reader is never told.
    loadPage.mockResolvedValueOnce(fullPage());
    loadPage.mockRejectedValueOnce(new Error('no such table'));

    render(<ConcordanceList total={60} loadPage={loadPage} header={<span />} />);
    await waitFor(() => expect(screen.getAllByTestId('concordance-row')).toHaveLength(20));

    screen.getByTestId('end-reached').click();

    await waitFor(() =>
      expect(screen.getByTestId('concordance-status').textContent).toBe(
        'Unable to load occurrences',
      ),
    );
    expect(screen.getByTestId('concordance-status').getAttribute('role')).toBe('alert');
    // The 20 rows that did load stay on screen -- the notice sits under them.
    expect(screen.getAllByTestId('concordance-row')).toHaveLength(20);
  });

  it('shows no status under a list that loaded cleanly', async () => {
    // The footer notice must be gated on `failed`, not on "paging stopped":
    // a complete list also stops paging, and telling that reader the load
    // broke is the same defect pointed the other way.
    loadPage.mockResolvedValueOnce(fullPage());
    render(<ConcordanceList total={20} loadPage={loadPage} header={<span />} />);
    await waitFor(() => expect(screen.getAllByTestId('concordance-row')).toHaveLength(20));

    expect(screen.queryByTestId('concordance-status')).toBeNull();
  });
});
