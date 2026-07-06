import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RootEntry } from '../components/dictionary/RootEntry';
import type { RootEntry as RootEntryT, ConcordanceEntry } from '@quran-corpus/data';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const entry: RootEntryT = {
  root: { id: 1, root_buckwalter: 'ktb', root_arabic: 'ك ت ب', occurrence_count: 319 },
  forms: [
    {
      id: 1,
      root_id: 1,
      sort_order: 0,
      pos_label: 'Noun',
      form_arabic: 'كِتَٰب',
      form_translit: 'kitāb',
      gloss: 'book',
      occurrence_count: 260,
    },
  ],
  definitions: [{ id: 1, root_id: 1, source: 'lane', definition: 'To write; to prescribe.' }],
};
const concordance: ConcordanceEntry[] = [];

describe('RootEntry', () => {
  it('renders occurrence count', () => {
    render(<RootEntry entry={entry} concordance={concordance} />);
    expect(screen.getByText(/319/)).toBeInTheDocument();
  });
  it("renders Lane's definition with attribution", () => {
    render(<RootEntry entry={entry} concordance={concordance} />);
    expect(screen.getByText(/To write/)).toBeInTheDocument();
    expect(screen.getByText(/lane/i)).toBeInTheDocument();
  });
  it("labels the qurandev-lane source as Lane's Lexicon", () => {
    const qd = {
      ...entry,
      definitions: [
        { id: 1, root_id: 1, source: 'qurandev-lane', definition: 'To write.' },
      ],
    };
    render(<RootEntry entry={qd} concordance={concordance} />);
    expect(screen.getByText("Lane's Lexicon")).toBeInTheDocument();
    expect(screen.queryByText(/qurandev-lane/)).toBeNull();
  });
  it('renders form groups', () => {
    render(<RootEntry entry={entry} concordance={concordance} />);
    expect(screen.getByText('Noun')).toBeInTheDocument();
  });
  it('omits definition block when none', () => {
    render(<RootEntry entry={{ ...entry, definitions: [] }} concordance={concordance} />);
    expect(screen.queryByText(/To write/)).toBeNull();
  });
  it('shows 3 letter pills and singular "1 time", no Buckwalter', () => {
    const entry = {
      root: { id: 1, root_buckwalter: 'dxl', root_arabic: 'د خ ل', occurrence_count: 1 },
      forms: [],
      definitions: [],
    };
    render(<RootEntry entry={entry} concordance={[]} />);
    expect(screen.queryByText(/dxl/)).toBeNull();
    expect(screen.getByText(/occurs 1 time(?!s)/)).toBeInTheDocument();
    for (const letter of ['د', 'خ', 'ل']) {
      expect(screen.getByText(letter)).toBeInTheDocument();
    }
  });
});
