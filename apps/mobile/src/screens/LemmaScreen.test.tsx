import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LemmaScreen } from './LemmaScreen';

const mocks = vi.hoisted(() => ({
  getLemmaScreen: vi.fn(),
  getLemmaOccurrences: vi.fn(),
}));

vi.mock('@/data/corpusRepository', () => ({
  getLemmaScreen: (...args: unknown[]) => mocks.getLemmaScreen(...args),
  getLemmaOccurrences: (...args: unknown[]) => mocks.getLemmaOccurrences(...args),
}));
vi.mock('@/data/openCorpusDb', () => ({ openCorpusDb: () => Promise.resolve({}) }));
vi.mock('@quran-corpus/mobile-data', () => ({ createExpoSqliteClient: () => ({}) }));
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', contentLanguage: 'en', arabicScale: 'medium' }),
}));

// Stubbed to the props LemmaScreen hands it: this suite is about what the
// screen renders and forwards, and ConcordanceList's own paging has its own
// suite.
vi.mock('@/components/ConcordanceList', async () => {
  const React = await import('react');
  return {
    ConcordanceList: ({ total, header }: { total: number; header: React.ReactElement }) =>
      React.createElement(
        'div',
        { 'data-testid': 'concordance', 'data-total': String(total) },
        header,
      ),
  };
});

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Link: ({ href, testID, children }: { href: string; testID?: string; children: React.ReactNode }) =>
      React.createElement('a', { href, 'data-testid': testID }, children),
  };
});

vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  return {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    Text: host('span'),
    View: host('div'),
  };
});

describe('LemmaScreen', () => {
  beforeEach(() => {
    mocks.getLemmaScreen.mockReset();
    mocks.getLemmaOccurrences.mockReset();
    mocks.getLemmaOccurrences.mockResolvedValue([]);
  });
  afterEach(cleanup);

  it('renders the not-found state for an invalid identifier', () => {
    render(<LemmaScreen lemmaBuckwalter={null} />);

    // queryBy, not getBy: getBy throws on a miss, which would fail this test
    // the same way for "wrong text" and for "unrelated render crash" -- the
    // toBeNull comparisons below are what actually pin the two facts down.
    const alert = screen.queryByText('This lemma is not in the corpus');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute('role')).toBe('alert');
    // Validated before the DB is opened.
    expect(mocks.getLemmaScreen).not.toHaveBeenCalled();
  });

  it('passes the occurrence total down to the list', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: {
        lemma: 'قَالَ',
        lemma_buckwalter: 'qAl',
        transliteration: null,
        root_buckwalter: 'qwl',
        count: 3,
        senses: [],
        top_glosses: [],
        root_definition: null,
        root_definition_source: null,
      },
      total: 1722,
    });

    render(<LemmaScreen lemmaBuckwalter="qAl" />);

    // From countLemmaConcordance (1722), not from the entry's own count (3):
    // the entry query groups occurrences away, and paging off that number
    // truncates the list at the wrong place.
    await waitFor(() => {
      const node = screen.queryByTestId('concordance');
      expect(node).not.toBeNull();
      expect(node?.getAttribute('data-total')).toBe('1722');
    });
  });

  it('labels the top glosses as translations, not as the lemma meaning', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: {
        lemma: 'ضَرَبَ',
        lemma_buckwalter: 'Darab',
        transliteration: null,
        root_buckwalter: null,
        count: 5,
        senses: [],
        top_glosses: ['Allah sets forth', 'struck'],
        root_definition: null,
        root_definition_source: null,
      },
      total: 5,
    });

    render(<LemmaScreen lemmaBuckwalter="Darab" />);

    await waitFor(() => expect(screen.queryByTestId('concordance')).not.toBeNull());
    expect(screen.queryByText('Translated as')).not.toBeNull();
    expect(screen.queryByText('Allah sets forth · struck')).not.toBeNull();
  });

  it('links to the lemma root when it has one', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: {
        lemma: 'آبَ',
        lemma_buckwalter: '>Ab',
        transliteration: null,
        // '>' is a Buckwalter letter and an unsafe path character (see
        // LetterScreen's equivalent case): the href must carry it
        // percent-encoded or the root route 404s.
        root_buckwalter: '>wb',
        count: 1,
        senses: [],
        top_glosses: [],
        root_definition: null,
        root_definition_source: null,
      },
      total: 1,
    });

    render(<LemmaScreen lemmaBuckwalter=">Ab" />);

    await waitFor(() => expect(screen.queryByTestId('lemma-root')).not.toBeNull());
    const link = screen.queryByTestId('lemma-root');
    expect(link?.getAttribute('href')).toBe('/root/%3Ewb');
    // 'word.root' ("Root"), not a duplicate 'lemma.root' key.
    expect(link?.textContent).toBe('Root');
  });

  it('renders no root link when the lemma has no root', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: {
        lemma: 'مَا',
        lemma_buckwalter: 'mA',
        transliteration: null,
        root_buckwalter: null,
        count: 1,
        senses: [],
        top_glosses: [],
        root_definition: null,
        root_definition_source: null,
      },
      total: 1,
    });

    render(<LemmaScreen lemmaBuckwalter="mA" />);

    await waitFor(() => expect(screen.queryByTestId('concordance')).not.toBeNull());
    expect(screen.queryByTestId('lemma-root')).toBeNull();
  });
});
