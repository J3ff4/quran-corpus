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

const base = { lemma: 'قَالَ', lemma_buckwalter: 'qaAla', transliteration: 'qala', pos_tag: 'V', count: 2 };

describe('LemmaEntry', () => {
  it('rooted lemma shows gloss + root definition + up-link', () => {
    render(<LemmaEntry entry={{ ...base, root_buckwalter: 'qwl', top_gloss: 'said', root_definition: 'to say' }} initialConcordance={[]} total={2} />);
    expect(screen.getByText('said')).toBeInTheDocument();
    expect(screen.getByText(/to say/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /root/i })).toHaveAttribute('href', '/dictionary/qwl');
  });

  it('rootless lemma: no definition block, no root link', () => {
    render(<LemmaEntry entry={{ ...base, lemma: 'مِن', lemma_buckwalter: 'min', pos_tag: 'P', count: 1, root_buckwalter: null, top_gloss: 'from', root_definition: null }} initialConcordance={[]} total={1} />);
    expect(screen.queryByRole('link', { name: /root/i })).toBeNull();
    expect(screen.getByText('from')).toBeInTheDocument();
  });

  it('null gloss: no meaning block, still renders', () => {
    render(<LemmaEntry entry={{ ...base, root_buckwalter: 'qwl', top_gloss: null, root_definition: 'to say' }} initialConcordance={[]} total={2} />);
    expect(screen.getByText('قَالَ')).toBeInTheDocument();
  });

  it('rooted lemma with null root_definition: shows the View-root link but no empty "Definition of root" label', () => {
    render(<LemmaEntry entry={{ ...base, root_buckwalter: 'qwl', top_gloss: 'said', root_definition: null }} initialConcordance={[]} total={2} />);
    // Up-link still present (navigating to the root page is always useful)...
    expect(screen.getByRole('link', { name: /root/i })).toHaveAttribute('href', '/dictionary/qwl');
    // ...but no titled-yet-empty definition box.
    expect(screen.queryByText(/Definition of root/i)).toBeNull();
  });
});
