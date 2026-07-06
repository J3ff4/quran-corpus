import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { SearchProvider } from '../components/search/SearchProvider';
import { SearchTrigger } from '../components/search/SearchTrigger';

// The sheet lazy-fetches /api/surahs on open; stub it so opening is quiet.
describe('SearchTrigger + SearchProvider', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] }) as Response));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a search-labelled button and no dialog initially', () => {
    render(
      <SearchProvider>
        <SearchTrigger />
      </SearchProvider>,
    );
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /search/i })).toBeNull();
  });

  it('opens the one shared sheet when the trigger is tapped', () => {
    render(
      <SearchProvider>
        <SearchTrigger />
      </SearchProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    expect(screen.getByRole('dialog', { name: /search/i })).toBeInTheDocument();
  });
});
