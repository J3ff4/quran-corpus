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
    // Anchored to the source-name link, not any text node containing the
    // substring: the Perseus entry's prose also says "Lane's Lexicon", so a
    // plain getByText/getAllByText here would still pass with the Lane
    // source object deleted entirely -- a licence breach this test exists
    // to catch.
    expect(screen.getByRole('link', { name: "Lane's Lexicon" })).toBeInTheDocument();
  });

  it('credits the Perseus Digital Library and its required availability sentence', () => {
    render(<About />);
    expect(
      screen.getByRole('link', { name: 'Perseus Digital Library' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Text provided by Perseus Digital Library, with funding from The U\.S\. Department of Education and The Max Planck Society\./,
      ),
    ).toBeInTheDocument();
  });

  it('credits Salmoné and both Perseus-supplied works', () => {
    render(<About />);
    // href, not just the name: a credit pointing at the wrong host is an
    // attribution failure the accessible name alone would never catch.
    expect(
      screen.getByRole('link', {
        name: "An Advanced Learner's Arabic-English Dictionary (Salmoné)",
      }),
    ).toHaveAttribute('href', 'https://www.perseus.tufts.edu/hopper/');
    expect(screen.getByText(/Librairie du Liban, 1889/)).toBeInTheDocument();
    expect(
      screen.getByText(/Lane's Lexicon and of Salmoné's Arabic-English Dictionary/),
    ).toBeInTheDocument();
  });

  it('credits machine-assisted Uzbek glosses (NLLB)', () => {
    render(<About />);
    expect(screen.getAllByText(/NLLB/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/machine-assisted/i)).toBeInTheDocument();
  });

  it('credits the KFGQPC Uthmanic Hafs mushaf font', () => {
    render(<About />);
    expect(screen.getAllByText(/KFGQPC/i).length).toBeGreaterThan(0);
  });

  it('credits the surah-name-v4 font and the arabesque frame art', () => {
    render(<About />);
    expect(screen.getByText(/surah-name-v4/i)).toBeInTheDocument();
    expect(screen.getAllByText(/quranfonts\.com/i).length).toBeGreaterThan(0);
  });
});
