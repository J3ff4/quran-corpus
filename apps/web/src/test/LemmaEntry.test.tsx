import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LemmaEntry } from '../components/dictionary/LemmaEntry';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../components/dictionary/ConcordanceList', () => ({
  ConcordanceList: () => <div data-testid="concordance" />,
}));

const base = {
  lemma: 'قَالَ',
  lemma_buckwalter: 'qaAla',
  transliteration: 'qala',
  senses: [{ pos_tag: 'V', pos_label: 'Verb', count: 2 }],
  count: 2,
};

describe('LemmaEntry', () => {
  it('rooted lemma shows gloss chips + root definition + up-link', () => {
    render(
      <LemmaEntry
        entry={{ ...base, root_buckwalter: 'qwl', top_glosses: ['said'], root_definition: 'to say' }}
        initialConcordance={[]}
        total={2}
      />,
    );
    expect(screen.getByText('said')).toBeInTheDocument();
    expect(screen.getByText(/to say/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /root/i })).toHaveAttribute('href', '/dictionary/qwl');
  });

  it('rootless lemma: no definition block, no root link', () => {
    render(
      <LemmaEntry
        entry={{
          ...base,
          lemma: 'مِن',
          lemma_buckwalter: 'min',
          senses: [{ pos_tag: 'P', pos_label: 'Preposition', count: 1 }],
          count: 1,
          root_buckwalter: null,
          top_glosses: ['from'],
          root_definition: null,
        }}
        initialConcordance={[]}
        total={1}
      />,
    );
    expect(screen.queryByRole('link', { name: /root/i })).toBeNull();
    expect(screen.getByText('from')).toBeInTheDocument();
  });

  it('no glosses: no "Translated as" block, still renders', () => {
    render(
      <LemmaEntry
        entry={{ ...base, root_buckwalter: 'qwl', top_glosses: [], root_definition: 'to say' }}
        initialConcordance={[]}
        total={2}
      />,
    );
    expect(screen.getByText('قَالَ')).toBeInTheDocument();
    expect(screen.queryByText(/Translated as/i)).toBeNull();
  });

  it('several glosses render as separate chips, order preserved', () => {
    render(
      <LemmaEntry
        entry={{
          ...base,
          root_buckwalter: 'Drb',
          top_glosses: ['sets forth', 'strike', 'presents'],
          root_definition: 'to strike',
        }}
        initialConcordance={[]}
        total={3}
      />,
    );
    const chips = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(chips).toEqual(['sets forth', 'strike', 'presents']);
    // Labelled as translations, never as the lemma's definition -- these are
    // contextual word-by-word glosses.
    expect(screen.getByText(/Translated as/i)).toBeInTheDocument();
  });

  it('single-sense lemma shows a bare POS label with no count', () => {
    render(
      <LemmaEntry
        entry={{ ...base, root_buckwalter: 'qwl', top_glosses: ['said'], root_definition: 'to say' }}
        initialConcordance={[]}
        total={2}
      />,
    );
    // The count belongs to the "occurs N times" line, not the sense. A bare
    // getByText('Verb') would still pass if the label rendered "Verb 2", so
    // assert the sense element's whole text.
    expect(screen.getByText('Verb').textContent).toBe('Verb');
    expect(screen.getByText(/occurs 2 times/)).toBeInTheDocument();
  });

  it('lemma with no senses omits the breakdown instead of rendering an empty slot', () => {
    // `senses` comes from a GROUP BY over `words.pos_tag`; a lemma whose rows
    // are all untagged yields none. The header must still read cleanly rather
    // than showing a stray separator or an empty label.
    render(
      <LemmaEntry
        entry={{
          ...base,
          senses: [],
          root_buckwalter: 'qwl',
          top_glosses: ['said'],
          root_definition: 'to say',
        }}
        initialConcordance={[]}
        total={2}
      />,
    );
    expect(screen.queryByText('Verb')).toBeNull();
    expect(screen.getByText(/occurs 2 times/)).toBeInTheDocument();
    expect(screen.getByText('qala')).toBeInTheDocument();
  });

  it('multi-sense lemma names every sense with its count, not just the commonest', () => {
    // مَا is the regression case: labelling it flatly "Relative pronoun" is
    // wrong for 911 of its 2177 occurrences.
    render(
      <LemmaEntry
        entry={{
          ...base,
          lemma: 'مَا',
          lemma_buckwalter: 'maA',
          senses: [
            { pos_tag: 'REL', pos_label: 'Relative pronoun', count: 1266 },
            { pos_tag: 'NEG', pos_label: 'Negative particle', count: 704 },
            { pos_tag: 'INTG', pos_label: 'Interrogative', count: 92 },
          ],
          count: 2062,
          root_buckwalter: null,
          top_glosses: ['what', 'And not'],
          root_definition: null,
        }}
        initialConcordance={[]}
        total={2062}
      />,
    );
    expect(screen.getByText('Relative pronoun')).toBeInTheDocument();
    expect(screen.getByText('Negative particle')).toBeInTheDocument();
    expect(screen.getByText('Interrogative')).toBeInTheDocument();
    expect(screen.getByText('1266')).toBeInTheDocument();
    expect(screen.getByText('704')).toBeInTheDocument();
  });

  it('rooted lemma with no root_definition: says so instead of rendering a blank box', () => {
    render(
      <LemmaEntry
        entry={{ ...base, root_buckwalter: 'qwl', top_glosses: ['said'], root_definition: null }}
        initialConcordance={[]}
        total={2}
      />,
    );
    // Up-link still present (navigating to the root page is always useful)...
    expect(screen.getByRole('link', { name: /root/i })).toHaveAttribute('href', '/dictionary/qwl');
    // ...and the gap is named rather than left silent.
    expect(screen.getByText(/No lexicon entry for this root/i)).toBeInTheDocument();
  });

  it('colour-codes each sense chip with the reader’s own posColor bucket', () => {
    // Same five --pos-* variables the word-by-word view uses, so a verb is the
    // same red in both places. Asserting the variable name rather than a hex
    // keeps this test honest if the palette is re-tuned.
    render(
      <LemmaEntry
        entry={{
          ...base,
          senses: [
            { pos_tag: 'V', pos_label: 'Verb', count: 2 },
            { pos_tag: 'N', pos_label: 'Noun', count: 1 },
          ],
          root_buckwalter: null,
          top_glosses: [],
          root_definition: null,
        }}
        initialConcordance={[]}
        total={3}
      />,
    );
    const dotOf = (label: string) =>
      screen.getByText(label).parentElement?.querySelector('span[aria-hidden="true"]');
    expect(dotOf('Verb')).toHaveStyle({ backgroundColor: 'var(--pos-verb)' });
    expect(dotOf('Noun')).toHaveStyle({ backgroundColor: 'var(--pos-noun)' });
  });

  it('renders no dot for a POS posColor deliberately leaves uncoloured', () => {
    // posColor returns null for DET on purpose -- corpus.quran.com does not
    // treat an assimilated determiner as its own category. A chip must then
    // show no dot at all rather than fall back to --pos-other, which would
    // assert a bucket the reader never assigns.
    render(
      <LemmaEntry
        entry={{
          ...base,
          senses: [{ pos_tag: 'DET', pos_label: 'Determiner', count: 2 }],
          root_buckwalter: null,
          top_glosses: [],
          root_definition: null,
        }}
        initialConcordance={[]}
        total={2}
      />,
    );
    const chip = screen.getByText('Determiner').parentElement;
    expect(chip?.querySelector('span[aria-hidden="true"]')).toBeNull();
  });
});
