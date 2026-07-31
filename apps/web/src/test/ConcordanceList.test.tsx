import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConcordanceEntry, RootForm } from '@quran-corpus/data';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { ConcordanceList } = await import('../components/dictionary/ConcordanceList');

const entry = (word_id: number, ayah_number: number): ConcordanceEntry => ({
  surah_id: 2,
  ayah_number,
  position: 2,
  word_id,
  text_arabic: 'HEAD',
  transliteration: null,
  gloss: null,
  form_id: null,
  verse_words: [
    { id: 100, position: 1, text_arabic: 'alpha' },
    { id: word_id, position: 2, text_arabic: 'beta' },
    { id: 300, position: 3, text_arabic: 'gamma' },
  ],
});

describe('ConcordanceList', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('empty -> No occurrences', () => {
    // TypingText renders one span per character; assert on textContent.
    const { container } = render(<ConcordanceList initialEntries={[]} total={0} rootBw="Aty" />);
    expect(container).toHaveTextContent(/No occurrences/);
  });

  it('washes only the matched word', () => {
    const { container } = render(
      <ConcordanceList initialEntries={[entry(200, 5)]} total={1} rootBw="Aty" />,
    );
    const marks = container.querySelectorAll('.text-accent-700');
    expect(marks).toHaveLength(1);
    expect(marks[0]!.textContent).toBe('beta');
  });

  it('renders a colored tag when the entry.form_id matches a passed forms entry', () => {
    const forms: RootForm[] = [
      {
        id: 9, root_id: 1, sort_order: 0, pos_label: 'Form I verb',
        form_arabic: 'غَفَرَ', form_translit: 'ghafara', gloss: null, occurrence_count: 65,
      },
    ];
    const withForm = { ...entry(200, 5), form_id: 9 };
    render(
      <ConcordanceList initialEntries={[withForm]} total={1} rootBw="gfr" forms={forms} />,
    );
    expect(screen.getByText('ghafara')).toBeInTheDocument();
  });

  it('omits the tag when form_id is null or forms is not passed', () => {
    const noForm = { ...entry(200, 5), form_id: null };
    render(<ConcordanceList initialEntries={[noForm]} total={1} rootBw="gfr" />);
    expect(screen.queryByText('ghafara')).toBeNull();
  });

  it('no Load more when the initial page is the whole concordance', () => {
    const items = Array.from({ length: 5 }, (_, i) => entry(200 + i, i + 1));
    render(<ConcordanceList initialEntries={items} total={5} rootBw="Aty" />);
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('Load more fetches the next page from the API and appends', async () => {
    const initial = Array.from({ length: 20 }, (_, i) => entry(1000 + i, i + 1));
    const next = Array.from({ length: 5 }, (_, i) => entry(2000 + i, i + 21));
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ entries: next, total: 25 }) });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <ConcordanceList initialEntries={initial} total={25} rootBw="Aty" />,
    );
    expect(container.querySelectorAll('li').length).toBe(20);

    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => expect(container.querySelectorAll('li').length).toBe(25));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/roots/Aty/concordance?offset=20&limit=20',
      { signal: expect.any(AbortSignal) },
    );
    // fully loaded -> button gone
    expect(screen.queryByRole('button', { name: /load more/i })).toBeNull();
  });

  it('surfaces a failure when Load more errors, keeping the button for retry', async () => {
    const initial = Array.from({ length: 20 }, (_, i) => entry(1000 + i, i + 1));
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    render(<ConcordanceList initialEntries={initial} total={25} rootBw="Aty" />);
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));

    await screen.findByRole('alert');
    // Button remains (not stuck on "Loading…") so the user can retry.
    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });

  it('trims a long verse to a window and expands on click', async () => {
    const verse_words = Array.from({ length: 20 }, (_, i) => ({
      id: i + 1, position: i + 1, text_arabic: `و${i + 1}`,
    }));
    const entry = {
      // ponytail: text_arabic set distinct from verse_words[9] ('و10') — the brief's
      // literal fixture had both equal, so the pre-existing header span (which always
      // renders entry.text_arabic) and the matched-word span both show 'و10',
      // making getByText('و10') ambiguous in every state. Not a trimming bug.
      surah_id: 2, ayah_number: 282, position: 10, word_id: 10,
      text_arabic: 'HEAD', transliteration: null, gloss: null, form_id: null, verse_words,
    };
    render(<ConcordanceList initialEntries={[entry]} total={1} rootBw="tst" />);
    // trimmed: matched word visible, far word (id 1 / و1) hidden until expanded
    expect(screen.getByText('و10')).toBeInTheDocument();
    expect(screen.queryByText('و1')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /show full verse/i }));
    expect(screen.getByText('و1')).toBeInTheDocument();
  });

  it('aborts an in-flight request on unmount', () => {
    const initial = Array.from({ length: 20 }, (_, i) => entry(1000 + i, i + 1));
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, opts?: { signal?: AbortSignal }) => {
      signal = opts?.signal;
      return new Promise<never>(() => {}); // never settles — request stays in flight
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(
      <ConcordanceList initialEntries={initial} total={25} rootBw="Aty" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    expect(signal?.aborted).toBe(false);
    unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('Load more includes forms= when a filter is already selected', async () => {
    const initial = Array.from({ length: 20 }, (_, i) => entry(1000 + i, i + 1));
    const next = Array.from({ length: 5 }, (_, i) => entry(2000 + i, i + 21));
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ entries: next, total: 25 }) });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <ConcordanceList initialEntries={initial} total={25} rootBw="Aty" selectedFormIds={[7]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/roots/Aty/concordance?offset=20&limit=20&forms=7',
        { signal: expect.any(AbortSignal) },
      ),
    );
  });

  it('omits the forms= param from the initial Load-more fetch when no filter is selected', async () => {
    const initial = Array.from({ length: 20 }, (_, i) => entry(1000 + i, i + 1));
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ entries: [], total: 20 }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<ConcordanceList initialEntries={initial} total={25} rootBw="Aty" />);
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/roots/Aty/concordance?offset=20&limit=20',
      { signal: expect.any(AbortSignal) },
    );
  });

  it('refetches from offset 0 with forms= when selectedFormIds changes', async () => {
    const initial = Array.from({ length: 5 }, (_, i) => entry(1000 + i, i + 1));
    const filtered = [{ ...entry(9000, 1), form_id: 3 }];
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ entries: filtered, total: 1 }) });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(
      <ConcordanceList initialEntries={initial} total={5} rootBw="Aty" selectedFormIds={[]} />,
    );
    expect(fetchMock).not.toHaveBeenCalled();

    rerender(
      <ConcordanceList initialEntries={initial} total={5} rootBw="Aty" selectedFormIds={[3]} />,
    );
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/roots/Aty/concordance?offset=0&limit=20&forms=3',
        { signal: expect.any(AbortSignal) },
      ),
    );
  });

  it('going back to no selection (All) restores the original unfiltered entries without refetching', async () => {
    const initial = Array.from({ length: 5 }, (_, i) => entry(1000 + i, i + 1));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { rerender, container } = render(
      <ConcordanceList initialEntries={initial} total={5} rootBw="Aty" selectedFormIds={[3]} />,
    );
    rerender(
      <ConcordanceList initialEntries={initial} total={5} rootBw="Aty" selectedFormIds={[]} />,
    );
    await waitFor(() => expect(container.querySelectorAll('li').length).toBe(5));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deselecting the active filter before its request resolves does not leave the list stuck on Loading', async () => {
    const initial = Array.from({ length: 5 }, (_, i) => entry(1000 + i, i + 1));
    // The filtered fetch triggered by selectedFormIds=[3] never resolves --
    // simulates deselecting back to "All" while it's still in flight.
    const fetchMock = vi.fn(() => new Promise<never>(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(
      <ConcordanceList initialEntries={initial} total={10} rootBw="Aty" selectedFormIds={[]} />,
    );
    rerender(
      <ConcordanceList initialEntries={initial} total={10} rootBw="Aty" selectedFormIds={[3]} />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    rerender(
      <ConcordanceList initialEntries={initial} total={10} rootBw="Aty" selectedFormIds={[]} />,
    );

    // Restored to "All" (hasMore, since 5 < 10) -- button must be usable, not
    // stuck showing "Loading…" from the aborted filtered request.
    const button = await screen.findByRole('button', { name: /load more/i });
    expect(button).not.toBeDisabled();
  });

  it('a superseded request that resolves after being aborted never overwrites the newer selection', async () => {
    const initial = Array.from({ length: 5 }, (_, i) => entry(1000 + i, i + 1));
    // Distinct ayah_number per entry so verseRef ("2:1:2" vs "2:2:2") lets the
    // assertions tell stale and fresh data apart -- entry()'s verse_words
    // text is identical regardless of word_id.
    const staleData = [{ ...entry(9001, 1), form_id: 1 }];
    const freshData = [{ ...entry(9002, 2), form_id: 2 }];

    // Each call gets its own externally-resolvable promise, so the test
    // controls resolution order independently of call/render order.
    let resolveStale!: (v: unknown) => void;
    let resolveFresh!: (v: unknown) => void;
    const stalePromise = new Promise((r) => (resolveStale = r));
    const freshPromise = new Promise((r) => (resolveFresh = r));
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(stalePromise)
      .mockReturnValueOnce(freshPromise);
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(
      <ConcordanceList initialEntries={initial} total={10} rootBw="Aty" selectedFormIds={[]} />,
    );
    rerender(
      <ConcordanceList initialEntries={initial} total={10} rootBw="Aty" selectedFormIds={[1]} />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Supersede before the stale request resolves -- this aborts its signal.
    rerender(
      <ConcordanceList initialEntries={initial} total={10} rootBw="Aty" selectedFormIds={[2]} />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // The fresh (form 2) request settles first -- the normal case.
    resolveFresh({ ok: true, json: async () => ({ entries: freshData, total: 1 }) });
    await waitFor(() => expect(screen.getByText('2:2:2')).toBeInTheDocument());

    // The stale (form 1) request's response arrives LAST, well after abort()
    // was already called on it -- real fetch mocks don't reject just because
    // a signal was aborted after the response already started resolving. It
    // must not retroactively clobber the already-committed fresh selection.
    resolveStale({ ok: true, json: async () => ({ entries: staleData, total: 1 }) });
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByText('2:2:2')).toBeInTheDocument();
    expect(screen.queryByText('2:1:2')).toBeNull();
  });

  it('fetches the provided endpoint on load-more', async () => {
    // Brief's literal fixture used initialEntries=[] with total=40, but zero
    // entries trips the component's early "No occurrences." return before the
    // Load-more button ever renders (see the first test in this file) --
    // getByRole('button', ...) would fail to find it regardless of endpoint
    // wiring. Seeded with 20 initial entries instead, matching every other
    // Load-more test in this file, so the button is actually present; intent
    // (assert the endpoint URL is fetched) is unchanged.
    const initial = Array.from({ length: 20 }, (_, i) => entry(1000 + i, i + 1));
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ entries: [], total: 40 }) });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <ConcordanceList initialEntries={initial} total={40} endpoint="/api/lemma/qaAla/concordance" />,
    );
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/lemma/qaAla/concordance?offset=20&limit=20',
        { signal: expect.any(AbortSignal) },
      ),
    );
  });
});
