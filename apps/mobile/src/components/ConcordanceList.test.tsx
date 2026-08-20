import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    FlatList: ({ data, renderItem, ListHeaderComponent, ListEmptyComponent, onEndReached }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      ListHeaderComponent?: React.ReactNode;
      ListEmptyComponent?: React.ReactNode;
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
    render(<ConcordanceList total={60} loadPage={loadPage} header={<span />} />);
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));

    screen.getByTestId('end-reached').click();

    // Re-requesting offset 0 renders the same page again and never advances,
    // which looks exactly like a list that has finished loading.
    await waitFor(() => expect(loadPage).toHaveBeenCalledWith(1, 20));
  });

  it('stops paging once every occurrence is loaded', async () => {
    render(<ConcordanceList total={1} loadPage={loadPage} header={<span />} />);
    await waitFor(() => expect(loadPage).toHaveBeenCalledTimes(1));

    screen.getByTestId('end-reached').click();
    screen.getByTestId('end-reached').click();

    expect(loadPage).toHaveBeenCalledTimes(1);
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
  });
});
