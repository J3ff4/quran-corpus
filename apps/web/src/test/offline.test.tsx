import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OfflinePage from '../app/offline/page';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('OfflinePage', () => {
  it('renders a heading', () => {
    render(<OfflinePage />);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('renders a link back to the surah list', () => {
    render(<OfflinePage />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/surah');
  });

  it('communicates offline state in the message', () => {
    render(<OfflinePage />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });
});
