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

// The entry UI has its own test file; what is unverified is the page's wiring
// from path segment to query argument.
vi.mock('../components/dictionary/RootEntry', () => ({
  RootEntry: () => <div data-testid="root-entry" />,
}));

const getRootEntry = vi.fn();
const getRootConcordancePage = vi.fn();
const countRootConcordance = vi.fn();
const getRootNeighbors = vi.fn();
const getDatabase = vi.fn(async () => ({}) as never);

vi.mock('../lib/db', () => ({ getDatabase: () => getDatabase() }));

vi.mock('@quran-corpus/data', async (importOriginal) => {
  // parseRootParam stays REAL: the point is that the page decodes and rejects
  // exactly what the concordance API does, and a stubbed parser would assert
  // that agreement into existence.
  const actual = await importOriginal<typeof import('@quran-corpus/data')>();
  return {
    ...actual,
    getRootEntry: (...a: unknown[]) => getRootEntry(...a),
    getRootConcordancePage: (...a: unknown[]) => getRootConcordancePage(...a),
    countRootConcordance: (...a: unknown[]) => countRootConcordance(...a),
    getRootNeighbors: (...a: unknown[]) => getRootNeighbors(...a),
  };
});

const { default: RootPage } = await import('../app/dictionary/[root]/page');
const { CONCORDANCE_PAGE_SIZE } = await import('@quran-corpus/data');

const page = (root: string) => RootPage({ params: Promise.resolve({ root }) });

describe('RootPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRootEntry.mockResolvedValue({ root_buckwalter: 'qwl' });
    getRootConcordancePage.mockResolvedValue([]);
    countRootConcordance.mockResolvedValue(0);
    getRootNeighbors.mockResolvedValue({ prev: null, next: null });
  });

  it('renders the entry and pages the concordance from offset 0', async () => {
    render(await page('qwl'));
    expect(screen.getByTestId('root-entry')).toBeInTheDocument();
    expect(getRootConcordancePage).toHaveBeenCalledWith(expect.anything(), 'qwl', {
      limit: CONCORDANCE_PAGE_SIZE,
      offset: 0,
    });
  });

  it('decodes the percent-encoded path segment before the lookup', async () => {
    // Next hands the page the *raw* segment, and `<` `>` `{` `|` `$` all
    // survive URL normalization percent-encoded -- 97 of 1642 roots contain
    // one. Validating without decoding first 404s every one of them, and every
    // unit test of the parser still passes, so the assertion has to be here.
    render(await page('%3Cmn'));
    expect(getRootEntry).toHaveBeenCalledWith(expect.anything(), '<mn');
    expect(getRootNeighbors).toHaveBeenCalledWith(expect.anything(), '<mn');
  });

  it('404s on an identifier the concordance API would reject, before touching the DB', async () => {
    // `%` is outside the Buckwalter charset, so a crafted escape that would
    // alias onto a real root if decoded twice dies here.
    await expect(page('qw%254c')).rejects.toThrow(NOT_FOUND);
    expect(getDatabase).not.toHaveBeenCalled();
    expect(getRootEntry).not.toHaveBeenCalled();
  });

  it('404s on a well-formed root with no entry', async () => {
    getRootEntry.mockResolvedValue(null);
    await expect(page('zzz')).rejects.toThrow(NOT_FOUND);
    expect(getRootConcordancePage).not.toHaveBeenCalled();
  });
});
