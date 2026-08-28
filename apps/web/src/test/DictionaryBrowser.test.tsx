import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DictionaryBrowser } from '../components/dictionary/DictionaryBrowser';
import type { RootSearchItem } from '@quran-corpus/data';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const roots: RootSearchItem[] = [
  { id: 1, root_buckwalter: 'ktb', root_arabic: 'ك ت ب', occurrence_count: 319, gloss_blob: 'write book' },
  { id: 2, root_buckwalter: 'smw', root_arabic: 'س م و', occurrence_count: 5, gloss_blob: 'high name, a written sign' },
  { id: 3, root_buckwalter: '$Am', root_arabic: 'ش أ م', occurrence_count: 3, gloss_blob: null },
];
const counts = { س: 1, ش: 1, ك: 1 };

function rowsOrder() {
  return within(screen.getByRole('list')).getAllByRole('link');
}

describe('DictionaryBrowser', () => {
  // jsdom's window.location persists across tests in this file; reset it so
  // one test's history.replaceState never leaks into the next test's mount.
  beforeEach(() => {
    window.history.replaceState(null, '', '/dictionary');
  });

  it('does not erase URL params with a stale-default write on mount', () => {
    window.history.replaceState(null, '', '/dictionary?q=ktb');
    const spy = vi.spyOn(window.history, 'replaceState');
    render(<DictionaryBrowser roots={roots} counts={counts} />);
    // The URL-sync effect must not fire before the URL-read state has settled;
    // if it does it writes bare '/dictionary', transiently dropping ?q=ktb.
    const written = spy.mock.calls.map((c) => c[2]);
    expect(written).not.toContain('/dictionary');
    spy.mockRestore();
  });

  it('renders a row per root', () => {
    render(<DictionaryBrowser roots={roots} counts={counts} />);
    expect(rowsOrder()).toHaveLength(3);
  });

  it('empty query shows all roots', () => {
    render(<DictionaryBrowser roots={roots} counts={counts} />);
    const box = screen.getByRole('searchbox', { name: /search/i });
    expect(box).toHaveValue('');
    expect(rowsOrder()).toHaveLength(3);
  });

  it('typing filters by root text', () => {
    render(<DictionaryBrowser roots={roots} counts={counts} />);
    fireEvent.change(screen.getByRole('searchbox', { name: /search/i }), { target: { value: 'smw' } });
    expect(rowsOrder()).toHaveLength(1);
    expect(screen.getByText('س م و')).toBeInTheDocument();
  });

  it('ignores a meaning needle shorter than the floor', () => {
    // `ok` sits inside `book` and nowhere else in the fixture. gloss_blob
    // carries dictionary prose now, so a two-letter needle through the meaning
    // arm keeps most of the corpus; three characters is where it filters.
    render(<DictionaryBrowser roots={roots} counts={counts} />);
    const box = screen.getByRole('searchbox', { name: /search/i });

    fireEvent.change(box, { target: { value: 'ook' } });
    expect(rowsOrder()).toHaveLength(1);

    fireEvent.change(box, { target: { value: 'ok' } });
    // No list at all is the empty state; the "No roots found." line itself
    // types in over time, so the absence of rows is what is assertable here.
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('ranks results by occurrence count while a query is running', () => {
    // Alphabetical is the default sort and puts س م و (5) before ك ت ب (319).
    // A query must invert that: `wri` matches both roots' meaning text, and
    // the one a reader is likeliest to want has to lead rather than fall
    // wherever the hijāʾī order drops it.
    render(<DictionaryBrowser roots={roots} counts={counts} />);
    fireEvent.change(screen.getByRole('searchbox', { name: /search/i }), {
      target: { value: 'wri' },
    });
    const texts = rowsOrder().map((a) => a.textContent ?? '');
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain('ك ت ب');
    expect(texts[1]).toContain('س م و');
  });

  it('bypasses an active letter while searching, and restores it when the box empties', () => {
    // Intersecting a letter with a query filtered invisibly: the grid is hidden
    // while searching, so a reader who had narrowed to ش and then typed would
    // get "No roots found." with nothing on screen explaining why. Mobile has
    // always bypassed the letter here; this is web catching up.
    render(<DictionaryBrowser roots={roots} counts={counts} />);
    fireEvent.click(screen.getByRole('button', { name: 'ش' }));
    expect(rowsOrder()).toHaveLength(1);

    const box = screen.getByRole('searchbox', { name: /search/i });
    // `book` is filed under ك, not the selected ش.
    fireEvent.change(box, { target: { value: 'book' } });
    expect(rowsOrder()).toHaveLength(1);
    expect(screen.getByText('ك ت ب')).toBeInTheDocument();

    // Bypassed, not cleared.
    fireEvent.change(box, { target: { value: '' } });
    expect(rowsOrder()).toHaveLength(1);
    expect(screen.getByText('ش أ م')).toBeInTheDocument();
  });

  it('hides the letter grid and the sort toggle while a query is running', () => {
    // A query fixes both scope and order, so leaving "Alphabetical" lit over a
    // frequency-ordered list is the control describing something the list is
    // not doing — and clicking it would change nothing on screen.
    render(<DictionaryBrowser roots={roots} counts={counts} />);
    expect(screen.getByRole('button', { name: /alphabetical/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ش' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox', { name: /search/i }), {
      target: { value: 'book' },
    });
    expect(screen.queryByRole('button', { name: /alphabetical/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /by frequency/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'ش' })).toBeNull();
  });

  // The branch stores corpus's hamza seat (ArD -> أرض). A bare-alif keyboard
  // spelling must still find it — same folding the server-side searchRoots does.
  it('typing folds the hamza seat (ارض finds أرض)', () => {
    const seated: RootSearchItem[] = [
      { id: 1, root_buckwalter: 'ArD', root_arabic: 'أرض', occurrence_count: 461, gloss_blob: null },
    ];
    render(<DictionaryBrowser roots={seated} counts={{ ا: 1 }} />);
    fireEvent.change(screen.getByRole('searchbox', { name: /search/i }), { target: { value: 'ارض' } });
    expect(screen.getByText('أرض')).toBeInTheDocument();
  });

  it('typing filters by meaning (gloss)', () => {
    render(<DictionaryBrowser roots={roots} counts={counts} />);
    fireEvent.change(screen.getByRole('searchbox', { name: /search/i }), { target: { value: 'book' } });
    expect(rowsOrder()).toHaveLength(1);
    expect(screen.getByText('ك ت ب')).toBeInTheDocument();
  });

  it('freq toggle re-sorts by occurrence_count desc', () => {
    render(<DictionaryBrowser roots={roots} counts={counts} />);
    fireEvent.click(screen.getByRole('button', { name: /by frequency/i }));
    const hrefs = rowsOrder().map((l) => l.getAttribute('href'));
    // `$Am` -> `%24Am`: root links now go through the shared rootPath(), which
    // always encodes. 97 of 1642 roots contain `$`. This assertion previously
    // pinned the raw interpolation these rows used to do.
    expect(hrefs).toEqual(['/dictionary/ktb', '/dictionary/smw', '/dictionary/%24Am']);
  });

  it('letter filter narrows to that letter’s roots', () => {
    render(<DictionaryBrowser roots={roots} counts={counts} />);
    fireEvent.click(screen.getByRole('button', { name: 'ش' }));
    expect(rowsOrder()).toHaveLength(1);
    expect(screen.getByText('ش أ م')).toBeInTheDocument();
  });

  it('switching sort clears an active letter filter (matches prior server behavior)', () => {
    render(<DictionaryBrowser roots={roots} counts={counts} />);
    fireEvent.click(screen.getByRole('button', { name: 'ش' }));
    expect(rowsOrder()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /by frequency/i }));
    expect(rowsOrder()).toHaveLength(3);
  });

  // Rendering all ~1,600 roots builds that many DOM nodes on every keystroke —
  // the reported dictionary slowness. Cap the DOM to a page and reveal more on
  // demand; the filter/sort still runs over the full in-memory list.
  describe('cap + show more', () => {
    const many: RootSearchItem[] = Array.from({ length: 250 }, (_, i) => ({
      id: i + 1,
      root_buckwalter: `r${i}`,
      root_arabic: `ك ت ${i}`,
      occurrence_count: 250 - i,
      gloss_blob: null,
    }));

    it('caps the initial render and offers Show more when the list exceeds the page', () => {
      render(<DictionaryBrowser roots={many} counts={{}} />);
      expect(rowsOrder()).toHaveLength(100);
      expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
    });

    it('Show more reveals the next page', () => {
      render(<DictionaryBrowser roots={many} counts={{}} />);
      fireEvent.click(screen.getByRole('button', { name: /show more/i }));
      expect(rowsOrder()).toHaveLength(200);
    });

    it('no Show more when the visible list fits in one page', () => {
      render(<DictionaryBrowser roots={roots} counts={counts} />);
      expect(screen.queryByRole('button', { name: /show more/i })).toBeNull();
    });

    it('changing the filter resets the cap to the first page', () => {
      render(<DictionaryBrowser roots={many} counts={{}} />);
      fireEvent.click(screen.getByRole('button', { name: /show more/i }));
      expect(rowsOrder()).toHaveLength(200);
      fireEvent.change(screen.getByRole('searchbox', { name: /search/i }), { target: { value: 'ك' } });
      expect(rowsOrder()).toHaveLength(100);
    });
  });
});
