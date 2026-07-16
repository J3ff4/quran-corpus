import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeToggle } from '../components/shell/ThemeToggle';

function stubMatchMedia(prefersDark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: prefersDark,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
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
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('stored choice beats OS preference', async () => {
    stubMatchMedia(true);
    localStorage.setItem('theme', 'light');
    render(<ThemeToggle />);
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking toggles theme, applies class, and persists', async () => {
    render(<ThemeToggle />);
    const toggle = screen.getByRole('switch', { name: 'Toggle dark mode' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem('theme')).toBe('light');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('storage event from another tab syncs class and state', async () => {
    render(<ThemeToggle />);
    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
    fireEvent(window, new StorageEvent('storage', { key: 'theme', newValue: 'dark' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    fireEvent(window, new StorageEvent('storage', { key: 'theme', newValue: 'light' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });
});
