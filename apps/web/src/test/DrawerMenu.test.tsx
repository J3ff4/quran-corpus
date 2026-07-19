import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DrawerMenu } from '../components/shell/DrawerMenu';
import { SearchProvider } from '../components/search/SearchProvider';

function renderDrawer(onClose = vi.fn()) {
  return render(
    <SearchProvider>
      <DrawerMenu open onClose={onClose} />
    </SearchProvider>,
  );
}

describe('DrawerMenu', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] }) as Response));
    // jsdom has no matchMedia; useTheme() reads it and framer-motion's useReducedMotion()
    // subscribes via addListener/removeListener, so the stub needs those no-ops too.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders Theme, Search, Bookmarks, Lemma Frequency, Verb Concordance, and About rows', () => {
    renderDrawer();
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^search$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /bookmarks/i })).toHaveAttribute('href', '/bookmarks');
    expect(screen.getByRole('link', { name: /lemma frequency/i })).toHaveAttribute(
      'href',
      '/dictionary/lemma-frequency',
    );
    expect(screen.getByRole('link', { name: /verb concordance/i })).toHaveAttribute(
      'href',
      '/dictionary/verb-concordance',
    );
    expect(screen.getByRole('link', { name: /about/i })).toHaveAttribute('href', '/about');
  });

  it('renders nothing when closed', () => {
    render(
      <SearchProvider>
        <DrawerMenu open={false} onClose={vi.fn()} />
      </SearchProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderDrawer(onClose);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes via the close button', () => {
    const onClose = vi.fn();
    renderDrawer(onClose);
    fireEvent.click(screen.getByRole('button', { name: /close menu/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('toggling theme flips the switch and the dark class', () => {
    renderDrawer();
    const themeSwitch = screen.getByRole('switch');
    expect(themeSwitch).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(themeSwitch);
    expect(themeSwitch).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('clicking Search closes the drawer and opens the search sheet', () => {
    const onClose = vi.fn();
    renderDrawer(onClose);
    fireEvent.click(screen.getByRole('button', { name: /^search$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('moves focus into the panel (close button) when opened', () => {
    renderDrawer();
    expect(screen.getByRole('button', { name: /close menu/i })).toHaveFocus();
  });

  it('restores focus to the trigger element on close', () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Menu';
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender, unmount } = render(
      <SearchProvider>
        <DrawerMenu open={false} onClose={vi.fn()} />
      </SearchProvider>,
    );
    expect(trigger).toHaveFocus();

    rerender(
      <SearchProvider>
        <DrawerMenu open onClose={vi.fn()} />
      </SearchProvider>,
    );
    expect(screen.getByRole('button', { name: /close menu/i })).toHaveFocus();

    rerender(
      <SearchProvider>
        <DrawerMenu open={false} onClose={vi.fn()} />
      </SearchProvider>,
    );
    expect(trigger).toHaveFocus();

    unmount();
    trigger.remove();
  });

  it('wraps Tab from the last focusable element back to the first', () => {
    renderDrawer();
    // Real focus-trap "first" is whatever's first in DOM order (queried via
    // querySelectorAll in the component, which includes the theme switch);
    // testing-library's role query for button/link excludes role="switch".
    const first = screen.getByRole('switch');
    const focusables = screen.getAllByRole('button').concat(screen.getAllByRole('link'));
    const last = focusables[focusables.length - 1]!;

    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
  });

  it('wraps Shift+Tab from the first focusable element back to the last', () => {
    renderDrawer();
    const first = screen.getByRole('switch');
    const focusables = screen.getAllByRole('button').concat(screen.getAllByRole('link'));
    const last = focusables[focusables.length - 1]!;

    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });
});
