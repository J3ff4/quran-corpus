import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeToggle } from '../components/shell/ThemeToggle';

function stubMatchMedia(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: prefersDark })),
  );
}

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    stubMatchMedia(false);
  });

  it('defaults to OS preference when nothing stored (dark system)', async () => {
    stubMatchMedia(true);
    render(<ThemeToggle />);
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('stored choice beats OS preference', async () => {
    stubMatchMedia(true);
    localStorage.setItem('theme', 'light');
    render(<ThemeToggle />);
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  it('opens menu with Light/Dark options; selecting Dark applies class and persists', async () => {
    render(<ThemeToggle />);
    const trigger = screen.getByRole('button', { name: 'Theme' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'theme-menu');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const dark = screen.getByRole('menuitemradio', { name: /dark/i });
    expect(screen.getByRole('menuitemradio', { name: /light/i })).toBeInTheDocument();

    fireEvent.click(dark);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    // menu closed after select
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('switching back to Light removes class and persists', async () => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /light/i }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('Escape closes the menu and returns focus to the trigger', async () => {
    render(<ThemeToggle />);
    const trigger = screen.getByRole('button', { name: 'Theme' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('opening moves focus to the checked item; arrows cycle items', async () => {
    localStorage.setItem('theme', 'dark');
    document.documentElement.classList.add('dark');
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Theme' }));

    const light = screen.getByRole('menuitemradio', { name: /light/i });
    const dark = screen.getByRole('menuitemradio', { name: /dark/i });
    expect(document.activeElement).toBe(dark); // checked item gets focus

    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'ArrowDown' }); // wraps past end
    expect(document.activeElement).toBe(light);
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(dark);
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(light);
    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(dark);
  });

  it('ArrowDown on the trigger opens the menu', async () => {
    render(<ThemeToggle />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Theme' }), { key: 'ArrowDown' });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('storage event from another tab syncs class and icon', async () => {
    render(<ThemeToggle />);
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
    fireEvent(window, new StorageEvent('storage', { key: 'theme', newValue: 'dark' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fireEvent(window, new StorageEvent('storage', { key: 'theme', newValue: 'light' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
