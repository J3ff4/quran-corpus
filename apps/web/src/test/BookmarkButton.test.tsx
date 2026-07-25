import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BookmarkButton } from '../components/shared/BookmarkButton';
import { toggleBookmark } from '../lib/bookmarks';

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  });
}

describe('BookmarkButton', () => {
  beforeEach(clearCookies);

  it('starts unbookmarked and toggles on click', async () => {
    render(<BookmarkButton surahId={2} ayahNumber={255} view="reading" />);
    const btn = await screen.findByRole('button', { name: /bookmark ayah 255/i });
    expect(btn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(btn);
    expect(
      screen.getByRole('button', { name: /remove bookmark, ayah 255/i }),
    ).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /remove bookmark/i }));
    expect(screen.getByRole('button', { name: /bookmark ayah 255/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('reflects a bookmark already stored on mount', async () => {
    toggleBookmark(2, 255, 'wbw');
    render(<BookmarkButton surahId={2} ayahNumber={255} view="wbw" />);
    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true'),
    );
  });

  it('reading and wbw views for the same verse toggle independently', () => {
    render(
      <>
        <BookmarkButton surahId={2} ayahNumber={255} view="reading" />
        <BookmarkButton surahId={2} ayahNumber={255} view="wbw" />
      </>,
    );
    const [readingBtn, wbwBtn] = screen.getAllByRole('button');
    fireEvent.click(readingBtn!);
    expect(readingBtn).toHaveAttribute('aria-pressed', 'true');
    expect(wbwBtn).toHaveAttribute('aria-pressed', 'false');
  });
});
