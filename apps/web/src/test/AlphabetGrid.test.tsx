import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AlphabetGrid } from '../components/dictionary/AlphabetGrid';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe('AlphabetGrid', () => {
  it('present letters link to ?letter=; empty letters are disabled', () => {
    render(<AlphabetGrid counts={{ ب: 3 }} />);
    expect(screen.getByRole('link', { name: 'ب' })).toHaveAttribute(
      'href',
      '/dictionary?letter=%D8%A8',
    );
    expect(screen.queryByRole('link', { name: 'ء' })).toBeNull();
    expect(screen.getByText('ء')).toHaveAttribute('aria-disabled', 'true');
  });
  it('active letter links back to /dictionary with aria-current', () => {
    render(<AlphabetGrid counts={{ ب: 3 }} activeLetter="ب" />);
    const b = screen.getByRole('link', { name: 'ب' });
    expect(b).toHaveAttribute('href', '/dictionary');
    expect(b).toHaveAttribute('aria-current', 'true');
  });
});
