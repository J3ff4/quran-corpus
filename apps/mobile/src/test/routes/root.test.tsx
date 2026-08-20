import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RootDefinition, RootEntry, RootForm } from '@quran-corpus/data/mobile';
// Not colocated with the route -- see word.test.tsx for why app/ cannot hold a
// test file.
import RootRoute from '../../../app/root/[buckwalter]';

const mocks = vi.hoisted(() => ({
  params: { buckwalter: 'rHm' } as Record<string, string>,
  getRootScreen: vi.fn(),
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mocks.params,
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

vi.mock('@/data/openCorpusDb', () => ({
  openCorpusDb: async () => ({}),
}));

vi.mock('@/data/corpusRepository', () => ({
  getRootScreen: (...args: unknown[]) => mocks.getRootScreen(...args),
  // The route loads the occurrence count alongside the entry. This suite is
  // about the header the route builds, so the concordance is stubbed empty and
  // the list itself mocked to its header below; ConcordanceList has its own
  // suite and RootRoute.test.tsx covers what the route forwards to it.
  getRootOccurrenceCount: async () => 0,
  getRootOccurrences: async () => [],
}));

vi.mock('@/components/ConcordanceList', () => ({
  ConcordanceList: ({ header }: { header: React.ReactElement }) => header,
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ contentLanguage: 'en', uiLocale: 'en' }),
}));

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');

  return {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    ScrollView: host('div'),
    Text: host('span'),
    View: host('div'),
  };
});

function form(id: number, formArabic: string, gloss: string | null): RootForm {
  return {
    id,
    root_id: 1,
    sort_order: id,
    pos_label: 'Noun',
    form_arabic: formArabic,
    form_translit: null,
    gloss,
    occurrence_count: 3,
  };
}

function definition(id: number, source: string, text: string): RootDefinition {
  return { id, root_id: 1, source, definition: text };
}

const entry: RootEntry = {
  root: { id: 1, root_buckwalter: 'rHm', root_arabic: 'رحم', occurrence_count: 339 },
  forms: [form(1, 'رَحْمَة', 'mercy'), form(2, 'رَحِيم', 'merciful')],
  definitions: [definition(1, 'hanswehr', 'to have mercy, to be merciful')],
};

describe('root route', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.params = { buckwalter: 'rHm' };
    mocks.getRootScreen.mockReset();
    mocks.getRootScreen.mockResolvedValue(entry);
  });

  it.each([
    ['../etc', 'a traversal segment'],
    // Not `r%48m` -- that decodes to the valid `rHm`. Double-encoding is the
    // real case: it decodes to `r%24m`, which still holds a `%`.
    ['r%2524m', 'double-encoded'],
    ['r m', 'whitespace'],
    ['', 'empty'],
    ['rHm%zz', 'a malformed escape'],
    ['r'.repeat(25), 'past the length cap'],
  ])('rejects buckwalter %s (%s) before querying', async (bad) => {
    // Route params are untrusted. The Buckwalter alphabet is a fixed set;
    // anything outside it cannot be a root and must not reach the query.
    mocks.params = { buckwalter: bad };

    render(<RootRoute />);

    expect(await screen.findByText('That root is not in the corpus')).toBeTruthy();
    expect(mocks.getRootScreen).not.toHaveBeenCalled();
  });

  it('queries the decoded identifier, not the raw segment', async () => {
    // Buckwalter carries `$`, `<` and `'`, none of which survive a raw path
    // segment -- the sheet encodes them, so this route has to decode them back
    // or every root with one in it resolves to nothing.
    mocks.params = { buckwalter: 'r%24m' };
    mocks.getRootScreen.mockResolvedValue(null);

    render(<RootRoute />);
    await screen.findByText('That root is not in the corpus');

    expect(mocks.getRootScreen).toHaveBeenCalledWith({}, 'r$m');
  });

  it('shows the root in Arabic, its forms and its definitions', async () => {
    render(<RootRoute />);

    expect(await screen.findByText('رحم')).toBeTruthy();
    expect(screen.getAllByTestId('root-form')).toHaveLength(2);
    expect(screen.getByText('to have mercy, to be merciful')).toBeTruthy();
  });

  it('credits the source of every definition it renders', async () => {
    // The definition text is third-party licensed (§11); shipping it with no
    // credit is a licence breach, not a cosmetic gap.
    render(<RootRoute />);

    expect(await screen.findByText('Hans Wehr Dictionary of Modern Written Arabic')).toBeTruthy();
  });

  it('renders forms and the root when a definition is missing', async () => {
    // 24 roots still have no definition (hw_gap_24.tsv). A screen that shows
    // nothing at all for them loses the forms too, which do exist.
    mocks.getRootScreen.mockResolvedValue({ ...entry, definitions: [] });

    render(<RootRoute />);

    expect(await screen.findByText('No definition for this root yet')).toBeTruthy();
    expect(screen.getAllByTestId('root-form')).toHaveLength(2);
  });

  it('shows the not-found state for a root the corpus does not carry', async () => {
    mocks.params = { buckwalter: 'qqq' };
    mocks.getRootScreen.mockResolvedValue(null);

    render(<RootRoute />);

    expect(await screen.findByText('That root is not in the corpus')).toBeTruthy();
  });

  it('shows the not-found state when the query throws', async () => {
    mocks.getRootScreen.mockRejectedValue(new Error('no such table: roots'));

    render(<RootRoute />);

    expect(await screen.findByText('That root is not in the corpus')).toBeTruthy();
  });
});
