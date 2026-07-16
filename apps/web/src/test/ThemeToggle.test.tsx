import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeToggle } from '../components/shell/ThemeToggle';

const mockUseReducedMotion = vi.fn(() => false);

// vitest hoists vi.mock above imports; motion.span is stubbed with a
// data-motion marker so tests can assert the animated path is skipped
// under prefers-reduced-motion (same pattern as FullAnalysis.test.tsx).
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    span: ({
      children,
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      ...props
    }: React.HTMLAttributes<HTMLSpanElement> & {
      children?: ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => (
      <span data-motion="true" {...props}>
        {children}
      </span>
    ),
  },
  useReducedMotion: () => mockUseReducedMotion(),
}));

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
    mockUseReducedMotion.mockReturnValue(false);
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

  it('animates the icon swap normally', () => {
    render(<ThemeToggle />);
    expect(screen.getByRole('switch').querySelector('[data-motion="true"]')).toBeInTheDocument();
  });

  it('skips the rotate/crossfade animation under prefers-reduced-motion', () => {
    mockUseReducedMotion.mockReturnValue(true);
    render(<ThemeToggle />);
    const toggle = screen.getByRole('switch', { name: 'Toggle dark mode' });
    expect(toggle.querySelector('[data-motion="true"]')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });
});
