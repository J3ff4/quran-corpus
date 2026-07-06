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
  { id: 2, root_buckwalter: 'smw', root_arabic: 'س م و', occurrence_count: 5, gloss_blob: 'high name' },
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
    expect(hrefs).toEqual(['/dictionary/ktb', '/dictionary/smw', '/dictionary/$Am']);
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
