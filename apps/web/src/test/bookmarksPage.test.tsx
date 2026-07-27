import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BookmarksView, type BookmarkRow } from '../app/bookmarks/BookmarksView';
import { toBookmarkRows } from '../app/bookmarks/rows';

const row: BookmarkRow = { surahId: 2, ayahNumber: 255, view: 'wbw', surahName: 'Al-Baqarah' };

const surahs = [
  { id: 1, name_translit: 'Al-Fatihah', ayah_count: 7 },
  { id: 2, name_translit: 'Al-Baqarah', ayah_count: 286 },
];

describe('toBookmarkRows', () => {
  it('joins bookmarks to their surah name', () => {
    expect(toBookmarkRows([{ surahId: 2, ayahNumber: 255, view: 'wbw' }], surahs)).toEqual([row]);
  });

  it('drops an ayah the surah does not have', () => {
    // Al-Fatihah has 7 ayahs; 8 passes the cookie's global 1..286 check but
    // would link to a scroll target the reader rejects.
    expect(toBookmarkRows([{ surahId: 1, ayahNumber: 8, view: 'reading' }], surahs)).toEqual([]);
    expect(toBookmarkRows([{ surahId: 1, ayahNumber: 7, view: 'reading' }], surahs)).toHaveLength(1);
  });

  it('drops a bookmark for a surah that is not in the list', () => {
    expect(toBookmarkRows([{ surahId: 99, ayahNumber: 1, view: 'reading' }], surahs)).toEqual([]);
  });

  it('preserves the given order', () => {
    const rows = toBookmarkRows(
      [
        { surahId: 2, ayahNumber: 255, view: 'wbw' },
        { surahId: 1, ayahNumber: 1, view: 'reading' },
      ],
      surahs,
    );
    expect(rows.map((r) => r.surahId)).toEqual([2, 1]);
  });
});

describe('BookmarksView', () => {
  it('shows an empty state with no bookmarks', () => {
    // TypingText splits the message into one span per character, so match on
    // the container's textContent rather than a single text node.
    const { container } = render(<BookmarksView rows={[]} />);
    expect(container).toHaveTextContent(/no bookmarks yet/i);
  });

  it('lists a bookmark with surah name, ayah number, and view tag', () => {
    render(<BookmarksView rows={[row]} />);
    expect(screen.getByRole('link', { name: /al-baqarah 255/i })).toHaveAttribute(
      'href',
      '/surah/2/words?ayah=255',
    );
    expect(screen.getByText(/word-by-word/i)).toBeInTheDocument();
  });

  it('links a reading bookmark to the reader, not the word-by-word view', () => {
    render(<BookmarksView rows={[{ ...row, view: 'reading' }]} />);
    expect(screen.getByRole('link', { name: /al-baqarah 255/i })).toHaveAttribute(
      'href',
      '/surah/2?ayah=255',
    );
  });

  it('renders rows in the order given, so the server-side recency order holds', () => {
    render(
      <BookmarksView
        rows={[row, { surahId: 1, ayahNumber: 1, view: 'reading', surahName: 'Al-Fatihah' }]}
      />,
    );
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveTextContent('Al-Baqarah 255');
    expect(links[1]).toHaveTextContent('Al-Fatihah 1');
  });
});
