import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomNav } from '../components/shell/BottomNav';

const mockPath = vi.fn(() => '/');
vi.mock('next/navigation', () => ({ usePathname: () => mockPath() }));

describe('BottomNav', () => {
  it('renders Home, Read, Dictionary links + a Search button', () => {
    mockPath.mockReturnValue('/');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /read/i })).toHaveAttribute('href', '/surah');
    expect(screen.getByRole('link', { name: /dictionary/i })).toHaveAttribute('href', '/dictionary');
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });

  it('marks Read active on a surah route, Home not active', () => {
    mockPath.mockReturnValue('/surah/2');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: /read/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current');
  });

  it('marks Read active on a word route (word ⊂ reading)', () => {
    mockPath.mockReturnValue('/word/2/255/1');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: /read/i })).toHaveAttribute('aria-current', 'page');
  });

  it('marks Dictionary active on a root route', () => {
    mockPath.mockReturnValue('/dictionary/ktb');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: /dictionary/i })).toHaveAttribute('aria-current', 'page');
  });

  it('opens the search sheet when Search is tapped', () => {
    mockPath.mockReturnValue('/');
    render(<BottomNav />);
    expect(screen.queryByRole('dialog', { name: /search/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    expect(screen.getByRole('dialog', { name: /search/i })).toBeInTheDocument();
  });
});
