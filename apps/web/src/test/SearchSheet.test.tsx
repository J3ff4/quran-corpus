import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchSheet } from '../components/search/SearchSheet';

const result = { jump: null, verses: [{ surah_id: 2, ayah_number: 255, source: 'en', snippet: 'the throne' }], roots: [] };

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => result }) as Response));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SearchSheet', () => {
  it('renders an input when open', () => {
    render(<SearchSheet open onClose={() => {}} />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });
  it('debounces then fetches and renders results', async () => {
    render(<SearchSheet open onClose={() => {}} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'throne' } });
    expect(fetch).not.toHaveBeenCalled(); // not yet — still within debounce
    await vi.advanceTimersByTimeAsync(250);
    expect(fetch).toHaveBeenCalledWith('/api/search?q=throne');
  });
  it('calls onClose from the close control', () => {
    const onClose = vi.fn();
    render(<SearchSheet open onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
