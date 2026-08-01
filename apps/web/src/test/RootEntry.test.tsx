import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RootEntry } from '../components/dictionary/RootEntry';
import type { RootEntry as RootEntryT, ConcordanceEntry } from '@quran-corpus/data';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
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
    render(<RootEntry entry={entry} initialConcordance={concordance} total={0} prevBw={null} nextBw={null} />);
    expect(screen.getByText(/319/)).toBeInTheDocument();
  });
  it("renders Lane's definition with attribution", () => {
    render(<RootEntry entry={entry} initialConcordance={concordance} total={0} prevBw={null} nextBw={null} />);
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
    render(<RootEntry entry={qd} initialConcordance={concordance} total={0} prevBw={null} nextBw={null} />);
    expect(screen.getByText("Lane's Lexicon")).toBeInTheDocument();
    expect(screen.queryByText(/qurandev-lane/)).toBeNull();
  });
  it('labels the corpus-forms source with the name credited on /about', () => {
    // Phase 20 fills 155 roots from corpus.quran.com's per-form glosses. The
    // label map's fallback prints the raw tag, so without an entry these all
    // credited themselves as the literal string "corpus-forms" -- a DB
    // identifier shown to readers, and the wrong attribution under §11.
    const cf = {
      ...entry,
      definitions: [
        { id: 1, root_id: 1, source: 'corpus-forms', definition: 'to write, to prescribe' },
      ],
    };
    render(<RootEntry entry={cf} initialConcordance={concordance} total={0} prevBw={null} nextBw={null} />);
    expect(screen.getByText('Quranic Arabic Corpus')).toBeInTheDocument();
    expect(screen.queryByText(/corpus-forms/)).toBeNull();
  });
  it('renders form groups', () => {
    render(<RootEntry entry={entry} initialConcordance={concordance} total={0} prevBw={null} nextBw={null} />);
    expect(screen.getByText('Noun')).toBeInTheDocument();
  });
  it('says so explicitly when the root has no lexicon entry', () => {
    // 256 of 1642 roots have no definition (upstream gaps in qurandev/roots).
    // Rendering nothing at all read as a broken page rather than a known gap.
    render(<RootEntry entry={{ ...entry, definitions: [] }} initialConcordance={concordance} total={0} prevBw={null} nextBw={null} />);
    expect(screen.queryByText(/To write/)).toBeNull();
    expect(screen.getByText(/No lexicon entry for this root yet/i)).toBeInTheDocument();
  });
  it('shows 3 letter pills and singular "1 time", no Buckwalter', () => {
    const entry = {
      root: { id: 1, root_buckwalter: 'dxl', root_arabic: 'د خ ل', occurrence_count: 1 },
      forms: [],
      definitions: [],
    };
    render(
      <RootEntry
        entry={entry}
        initialConcordance={[]}
        total={0}
        prevBw={null}
        nextBw={null}
      />,
    );
    expect(screen.queryByText(/dxl/)).toBeNull();
    expect(screen.getByText(/occurs 1 time(?!s)/)).toBeInTheDocument();
    for (const letter of ['د', 'خ', 'ل']) {
      expect(screen.getByText(letter)).toBeInTheDocument();
    }
  });
  it('renders prev/next root links, disabled at an end', () => {
    render(
      <RootEntry
        entry={entry}
        initialConcordance={concordance}
        total={0}
        prevBw="smw"
        nextBw={null}
      />,
    );
    const prev = screen.getByRole('link', { name: /previous root/i });
    expect(prev).toHaveAttribute('href', '/dictionary/smw');
    // next is at the end → not a link
    expect(screen.queryByRole('link', { name: /next root/i })).toBeNull();
    expect(screen.getByLabelText(/next root/i)).toHaveAttribute('aria-disabled', 'true');
  });
});
