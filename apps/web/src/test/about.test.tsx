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

  it('does not credit Salmoné, whose import phase 24 dropped', () => {
    // A credit for a dictionary carrying zero rows tells a reader the app
    // draws on a source it does not. The Perseus credit stays -- perseus-lane
    // still has 217 rows -- but must no longer claim Salmoné's text with it.
    render(<About />);
    // The whole name, not just the credit's title: deleting the Salmoné entry
    // left the Hans Wehr note still contrasting itself with "Lane and Salmoné",
    // naming a dictionary the page never credits and the app never ships.
    expect(screen.queryByText(/Salmoné/)).toBeNull();
    expect(screen.queryByText(/Librairie du Liban, 1889/)).toBeNull();
    expect(
      screen.getByText(/The TEI text of Lane's Lexicon behind root definitions/),
    ).toBeInTheDocument();
  });

  it('credits the hand-written editorial glosses without a dead link', () => {
    // The glosses are this project's own and its repository is private, so the
    // credit carries no href -- a 404 on the page that states the licence terms
    // is worse than plain text. Give it a public home and the link comes back.
    render(<About />);
    expect(screen.getByText('Editorial glosses (this project)')).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Editorial glosses (this project)' }),
    ).toBeNull();
    expect(screen.getByText(/no dictionary in the pipeline covers/)).toBeInTheDocument();
  });

  it('credits Tasnim for the Uzbek word-by-word, and no longer NLLB', () => {
    render(<About />);
    expect(screen.getAllByText(/Tasnim/i).length).toBeGreaterThan(0);
    // The machine-translated glosses were deleted from the corpus, so crediting
    // the model that produced them would describe data the app no longer ships.
    expect(screen.queryAllByText(/NLLB/i)).toHaveLength(0);
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
