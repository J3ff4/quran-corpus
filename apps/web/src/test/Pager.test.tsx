import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pager } from '../components/wbw/Pager';

describe('Pager', () => {
  it('renders nothing for a single-page surah', () => {
    const { container } = render(<Pager surahId={1} page={1} totalPages={1} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows Next but not Prev on the first page', () => {
    render(<Pager surahId={2} page={1} totalPages={20} />);
    expect(screen.getByText('Page 1 / 20')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /next/i })).toHaveAttribute('href', '/surah/2/words?page=2');
    expect(screen.queryByRole('link', { name: /prev/i })).toBeNull();
  });

  it('shows Prev but not Next on the last page', () => {
    render(<Pager surahId={2} page={20} totalPages={20} />);
    expect(screen.getByRole('link', { name: /prev/i })).toHaveAttribute('href', '/surah/2/words?page=19');
    expect(screen.queryByRole('link', { name: /next/i })).toBeNull();
  });
});
