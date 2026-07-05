import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { SearchSheet } from '../components/search/SearchSheet';

const result = { jump: null, verses: [{ surah_id: 2, ayah_number: 255, source: 'en', snippet: 'the throne' }], roots: [] };
const pickerSurahs = [{ id: 1, name_translit: 'Al-Fatihah', ayah_count: 7 }];

// Route by URL: search calls get the search result, /api/surahs gets the picker list.
function fetchByUrl(url: string) {
  if (url.includes('/api/surahs')) return { ok: true, json: async () => pickerSurahs } as Response;
  return { ok: true, json: async () => result } as Response;
}

describe('SearchSheet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => fetchByUrl(url)));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders an input when open', () => {
    render(<SearchSheet open onClose={() => {}} />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });
  it('debounces then fetches and renders results', async () => {
    render(<SearchSheet open onClose={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'throne' } });
    // not yet — still within debounce (the surah-picker fetch on mount is separate)
    expect(fetch).not.toHaveBeenCalledWith('/api/search?q=throne', expect.anything());
    await vi.advanceTimersByTimeAsync(250);
    expect(fetch).toHaveBeenCalledWith(
      '/api/search?q=throne',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
  it('calls onClose from the close control', () => {
    const onClose = vi.fn();
    render(<SearchSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
  it('closes on Escape while open', () => {
    const onClose = vi.fn();
    render(<SearchSheet open onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('SearchSheet verse picker', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => pickerSurahs })) as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it('fetches /api/surahs on open and shows the picker', async () => {
    render(<SearchSheet open onClose={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText(/surah/i)).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith('/api/surahs', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it('does not fetch when closed', () => {
    render(<SearchSheet open={false} onClose={() => {}} />);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
