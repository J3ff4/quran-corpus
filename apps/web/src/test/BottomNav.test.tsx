import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomNav } from '../components/shell/BottomNav';
import { SearchProvider } from '../components/search/SearchProvider';

const mockPath = vi.fn(() => '/');
vi.mock('next/navigation', () => ({ usePathname: () => mockPath() }));

// BottomNav consumes useSearch() and the shared sheet lives in the provider,
// so every render is wrapped and the sheet's open-time /api/surahs fetch stubbed.
function renderNav() {
  return render(
    <SearchProvider>
      <BottomNav />
    </SearchProvider>,
  );
}

describe('BottomNav', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] }) as Response));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders Home, Read, Dictionary links + a Search button', () => {
    mockPath.mockReturnValue('/');
    renderNav();
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /read/i })).toHaveAttribute('href', '/surah');
    expect(screen.getByRole('link', { name: /dictionary/i })).toHaveAttribute('href', '/dictionary');
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });

  it('marks Read active on a surah route, Home not active', () => {
    mockPath.mockReturnValue('/surah/2');
    renderNav();
    expect(screen.getByRole('link', { name: /read/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current');
  });

  it('marks Read active on a word route (word ⊂ reading)', () => {
    mockPath.mockReturnValue('/word/2/255/1');
    renderNav();
    expect(screen.getByRole('link', { name: /read/i })).toHaveAttribute('aria-current', 'page');
  });

  it('marks Dictionary active on a root route', () => {
    mockPath.mockReturnValue('/dictionary/ktb');
    renderNav();
    expect(screen.getByRole('link', { name: /dictionary/i })).toHaveAttribute('aria-current', 'page');
  });

  it('opens the shared search sheet when Search is tapped', () => {
    mockPath.mockReturnValue('/');
    renderNav();
    expect(screen.queryByRole('dialog', { name: /search/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    expect(screen.getByRole('dialog', { name: /search/i })).toBeInTheDocument();
  });
});
