import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { FrequencyTable } from '../components/dictionary/FrequencyTable';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('FrequencyTable', () => {
  it('renders ranked rows with counts', () => {
    render(
      <FrequencyTable
        caption="Lemma Frequency"
        rows={[
          { label: 'ٱللَّه', count: 2699 },
          { label: 'رَبّ', count: 970 },
        ]}
      />,
    );
    expect(screen.getByText('ٱللَّه')).toBeInTheDocument();
    expect(screen.getByText(/2699/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /lemma frequency/i })).toBeInTheDocument();
  });

  it('renders a link when row has href, plain text otherwise', () => {
    render(
      <FrequencyTable
        caption="c"
        rows={[
          { label: 'قَالَ', count: 2, href: '/dictionary/lemma/qaAla' },
          { label: 'مِن', count: 1 },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'قَالَ' })).toHaveAttribute(
      'href',
      '/dictionary/lemma/qaAla',
    );
    expect(screen.queryByRole('link', { name: 'مِن' })).toBeNull();
  });

  it('exposes exactly one link per linked row, none hidden from assistive tech', () => {
    // A linked row carries exactly one anchor, on the label cell -- NOT a
    // stretched link over the whole row, which FrequencyTable rejects (it needs
    // `position: relative` on the <tr>, unreliable in WebKit). Wrapping the
    // rank/count cells in their own aria-hidden anchors was the other rejected
    // shape: it puts interactive elements in the DOM that AT cannot reach.
    const { container } = render(
      <FrequencyTable
        caption="c"
        rows={[
          { label: 'قَالَ', count: 2, href: '/dictionary/lemma/qaAla' },
          { label: 'رَبّ', count: 1, href: '/dictionary/lemma/rab~' },
        ]}
      />,
    );
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(container.querySelectorAll('a[aria-hidden], a[tabindex="-1"]')).toHaveLength(0);
  });
});
