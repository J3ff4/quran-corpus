import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RootListRow } from '../components/dictionary/RootListRow';
import type { Root } from '@quran-corpus/data';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const root: Root = { id: 1, root_buckwalter: 'ktb', root_arabic: 'ك ت ب', occurrence_count: 319 };

describe('RootListRow', () => {
  it('links to the root entry', () => {
    render(<RootListRow root={root} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/dictionary/ktb');
  });
  it('shows Arabic root and count', () => {
    render(<RootListRow root={root} />);
    expect(screen.getByText('ك ت ب')).toBeInTheDocument();
    expect(screen.getByText(/319/)).toBeInTheDocument();
  });
});
