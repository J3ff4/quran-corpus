import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// notFound() aborts rendering by throwing in Next; reproduce that so a branch
// that forgets to return still fails the test instead of falling through to
// the DB calls below it.
const NOT_FOUND = new Error('NEXT_NOT_FOUND');
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../components/dictionary/ConcordanceList', () => ({
  ConcordanceList: () => <div data-testid="concordance" />,
}));

const getLemmaEntry = vi.fn();
const getLemmaConcordancePage = vi.fn();
const getDatabase = vi.fn(async () => ({}) as never);

vi.mock('../lib/db', () => ({ getDatabase: () => getDatabase() }));

vi.mock('@quran-corpus/data', async (importOriginal) => {
  // parseLemmaParam stays REAL: the point of the first branch is that the page
  // decodes and rejects exactly what the concordance API does, and a stubbed
  // parser would assert that agreement into existence.
  const actual = await importOriginal<typeof import('@quran-corpus/data')>();
  return {
    ...actual,
    getLemmaEntry: (...a: unknown[]) => getLemmaEntry(...a),
    getLemmaConcordancePage: (...a: unknown[]) => getLemmaConcordancePage(...a),
  };
});

const { default: LemmaPage } = await import('../app/dictionary/lemma/[lemma]/page');
const { CONCORDANCE_PAGE_SIZE } = await import('@quran-corpus/data');

const entry = {
  lemma: 'قَالَ',
  lemma_buckwalter: 'qaAla',
  transliteration: 'qala',
  senses: [{ pos_tag: 'V', pos_label: 'Verb', count: 2 }],
  count: 2,
  root_buckwalter: 'qwl',
  top_glosses: ['said'],
  root_definition: 'to say',
};

const page = (lemma: string) => LemmaPage({ params: Promise.resolve({ lemma }) });

describe('LemmaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLemmaEntry.mockResolvedValue(entry);
    getLemmaConcordancePage.mockResolvedValue([]);
  });

  it('renders the entry and pages the concordance from offset 0', async () => {
    render(await page('qaAla'));
    expect(screen.getByText('قَالَ')).toBeInTheDocument();
    expect(screen.getByTestId('concordance')).toBeInTheDocument();
    expect(getLemmaConcordancePage).toHaveBeenCalledWith(expect.anything(), 'qaAla', {
      limit: CONCORDANCE_PAGE_SIZE,
      offset: 0,
    });
  });

  it('decodes the percent-encoded path segment before the lookup', async () => {
    // Next hands the page the *raw* segment, and `{` `>` `<` `|` `$` all
    // survive URL normalization percent-encoded -- 1669 of 4832 lemmas contain
    // one. Validating without decoding first 404s every one of them, and every
    // unit test of the parser still passes, so the assertion has to be here.
    render(await page('%7Bll~ah'));
    expect(getLemmaEntry).toHaveBeenCalledWith(expect.anything(), '{ll~ah');
    expect(getLemmaConcordancePage).toHaveBeenCalledWith(expect.anything(), '{ll~ah', {
      limit: CONCORDANCE_PAGE_SIZE,
      offset: 0,
    });
  });

  it('404s on an identifier the concordance API would reject, before touching the DB', async () => {
    // The asymmetry this guards: SSR accepting an id the client-side Load-more
    // then 400s on. `%` is outside the Buckwalter charset, so a crafted escape
    // that would alias onto a real entry if decoded twice dies here.
    await expect(page('qa%2541la')).rejects.toThrow(NOT_FOUND);
    expect(getDatabase).not.toHaveBeenCalled();
    expect(getLemmaEntry).not.toHaveBeenCalled();
  });

  it('404s on a well-formed lemma with no occurrences', async () => {
    getLemmaEntry.mockResolvedValue(null);
    await expect(page('zzz')).rejects.toThrow(NOT_FOUND);
    expect(getLemmaConcordancePage).not.toHaveBeenCalled();
  });

  it('uses the entry count as the paging total instead of a second count query', async () => {
    render(await page('qaAla'));
    expect(screen.getByText(/Concordance \(2\)/)).toBeInTheDocument();
  });
});
