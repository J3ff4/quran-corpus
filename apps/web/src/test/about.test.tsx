import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import About from '../app/about/page';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('About page', () => {
  it("credits corpus.quran.com and Lane's Lexicon", () => {
    render(<About />);
    expect(screen.getByText(/corpus\.quran\.com/i)).toBeInTheDocument();
    expect(screen.getByText(/Lane's Lexicon/i)).toBeInTheDocument();
  });

  it('credits machine-assisted Uzbek glosses (NLLB)', () => {
    render(<About />);
    expect(screen.getAllByText(/NLLB/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/machine-assisted/i)).toBeInTheDocument();
  });
});
