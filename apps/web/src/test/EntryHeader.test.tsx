import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { EntryHeader } from '../components/dictionary/EntryHeader';

describe('EntryHeader', () => {
  it('stacks the transliteration under the headword rather than beside it', () => {
    // The layout claim, asserted structurally: the transliteration must be a
    // sibling of the h1 inside the header, not a child of some inline row that
    // also holds the h1. A getByText alone would pass either way.
    render(<EntryHeader arabic="قَالَ" transliteration="qala" count={2} />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('قَالَ');
    const translit = screen.getByText('qala');
    expect(translit.parentElement).toBe(heading.parentElement);
    // ...and after it, so it reads as a pronunciation of the word above.
    expect(heading.compareDocumentPosition(translit)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('omits the transliteration line when there is none (the root page)', () => {
    const { container } = render(<EntryHeader arabic="ق و ل" count={1722} />);
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(screen.getByText(/occurs 1722 times/)).toBeInTheDocument();
  });

  it('renders no chip row when the caller passes nothing', () => {
    // `children && <div>` is the guard: a caller that passes `false` for an
    // empty set must not leave a flex row with a top margin behind it.
    const { container } = render(
      <EntryHeader arabic="قَالَ" count={2}>
        {false}
      </EntryHeader>,
    );
    expect(container.querySelector('header > div')).toBeNull();
  });

  it('singularises the count line at exactly one occurrence', () => {
    render(<EntryHeader arabic="ق و ل" count={1} />);
    expect(screen.getByText('occurs 1 time')).toBeInTheDocument();
  });
});
