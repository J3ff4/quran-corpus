import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Overrides the blanket mock in setup.ts so the refresh call is observable.
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { BookmarkButton } from '../components/shared/BookmarkButton';
import { toggleBookmark } from '../lib/bookmarks';

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  });
}

describe('BookmarkButton', () => {
  beforeEach(() => {
    clearCookies();
    refresh.mockClear();
  });

  it('invalidates the router cache on toggle, so /bookmarks is not served stale', () => {
    // The bookmarks list is server-rendered from this cookie; a back
    // navigation replays the cached payload built before the toggle, leaving a
    // removed ayah on the list until a hard reload.
    render(<BookmarkButton surahId={2} ayahNumber={255} view="reading" />);
    fireEvent.click(screen.getByRole('button'));
    expect(refresh).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button'));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('refreshes off cookie truth, not a stale icon', () => {
    // Another tab removed the bookmark since this button last synced, so the
    // icon still reads filled. The tap re-adds it — a real change to the
    // cookie, so /bookmarks must be invalidated even though React state
    // happens to land on the same value it started with.
    toggleBookmark(2, 255, 'reading');
    render(<BookmarkButton surahId={2} ayahNumber={255} view="reading" />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');

    clearCookies(); // the other tab
    fireEvent.click(btn);
    // Comparing against React state would see true -> true and stay quiet.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh when the cookie write failed', () => {
    // toggleBookmark reports the unchanged state when persisting fails
    // (blocked cookies, size cap) -- nothing changed, nothing to invalidate.
    Object.defineProperty(document, 'cookie', {
      get: () => '',
      set: () => undefined,
      configurable: true,
    });
    try {
      render(<BookmarkButton surahId={2} ayahNumber={255} view="reading" />);
      fireEvent.click(screen.getByRole('button'));
      expect(refresh).not.toHaveBeenCalled();
    } finally {
      // Drop the shadowing own property; the jsdom accessor takes over again.
      Reflect.deleteProperty(document, 'cookie');
    }
  });

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

  it('renders the server-known state in the SSR markup, so the icon never paints empty first', () => {
    const html = renderToStaticMarkup(
      <BookmarkButton surahId={2} ayahNumber={255} view="reading" initialBookmarked />,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('fill="currentColor"');
  });

  it('lets the cookie win over a stale server snapshot (remount after a client toggle)', () => {
    // What the WBW card/list switch does: remounts the button with the prop the
    // server rendered, after the user has already un-bookmarked the ayah.
    render(<BookmarkButton surahId={2} ayahNumber={255} view="wbw" initialBookmarked />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });

  it('defaults to unbookmarked when the page passes no server state', () => {
    const html = renderToStaticMarkup(<BookmarkButton surahId={2} ayahNumber={255} view="reading" />);
    expect(html).toContain('aria-pressed="false"');
  });
});
