import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import BookmarksPage from '../app/bookmarks/page';
import { toggleBookmark } from '../lib/bookmarks';

const pickerSurahs = [{ id: 2, name_translit: 'Al-Baqarah', ayah_count: 286 }];

describe('BookmarksPage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => pickerSurahs }) as Response));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows an empty state with no bookmarks', async () => {
    render(<BookmarksPage />);
    await waitFor(() => expect(screen.getByText(/no bookmarks yet/i)).toBeInTheDocument());
  });

  it('lists a bookmark with surah name, ayah number, and view tag', async () => {
    toggleBookmark(2, 255, 'wbw');
    render(<BookmarksPage />);
    await waitFor(() => expect(screen.getByText(/al-baqarah 255/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /al-baqarah 255/i })).toHaveAttribute(
      'href',
      '/surah/2/words?ayah=255',
    );
    expect(screen.getByText(/word-by-word/i)).toBeInTheDocument();
  });

  it('most-recently-bookmarked entry appears first', async () => {
    toggleBookmark(1, 1, 'reading');
    await new Promise((r) => setTimeout(r, 2));
    toggleBookmark(2, 255, 'wbw');
    render(<BookmarksPage />);
    const links = await screen.findAllByRole('link');
    expect(links[0]).toHaveTextContent('255');
  });

  it('syncs with a bookmark added in another tab via the storage event', async () => {
    render(<BookmarksPage />);
    await waitFor(() => expect(screen.getByText(/no bookmarks yet/i)).toBeInTheDocument());

    // Simulate another tab adding a bookmark, then firing storage.
    toggleBookmark(2, 255, 'wbw');
    fireEvent(window, new StorageEvent('storage', { key: 'bookmarks' }));

    await waitFor(() => expect(screen.getByText(/al-baqarah 255/i)).toBeInTheDocument());
  });
});
