import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WbwAyahBlock } from '../components/wbw/WbwAyahBlock';
import { WbwAyahListBlock } from '../components/wbw/WbwAyahListBlock';
import { WbwGlossSpan } from '../components/wbw/WbwGlossSpan';
import type { WbwAyah, WbwCell } from '../components/wbw/types';

// Tasnim's "shubha yo'q" is ONE gloss over لَا and رَيْبَ. Rendering it under
// each word reads as two identical glosses, which is a different claim about
// the verse than the source makes.
const c = (position: number, arabic: string, gloss: string, glossGroup: number | null): WbwCell => ({
  surahId: 2, ayahNumber: 2, position, arabic, translit: 't', gloss,
  glossLang: 'uz', glossGroup,
  posTag: 'N', posLabel: 'Noun', segments: [], grammarNote: null,
});

const ayah: WbwAyah = {
  ayahNumber: 2,
  cells: [c(1, 'لَا', "shubha yo'q", 4), c(2, 'رَيْبَ', "shubha yo'q", 4), c(3, 'فِيهِ', 'unda', null)],
  textUthmani: 'x',
};

describe('a gloss_group span', () => {
  it('renders one gloss over the pair in the card layout', () => {
    render(<WbwAyahBlock bookmarked={false} surahId={2} ayah={ayah} pageLang="uz" />);
    expect(screen.getAllByText("shubha yo'q")).toHaveLength(1);
    expect(screen.getByText('unda')).toBeInTheDocument();
    // Both words keep their own link: the span is a fact about the
    // translation, not about the morphology.
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      '/word/2/2/1',
      '/word/2/2/2',
      '/word/2/2/3',
    ]);
  });

  it('spans one translation cell down the pair in the table layout', () => {
    const { container } = render(
      <WbwAyahListBlock bookmarked={false} surahId={2} ayah={ayah} pageLang="uz" />,
    );
    expect(screen.getAllByText("shubha yo'q")).toHaveLength(1);
    // Three words, three rows, but only two translation cells.
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);
    const spanned = container.querySelector('td[rowspan="2"]');
    expect(spanned).not.toBeNull();
    expect(spanned).toHaveTextContent("shubha yo'q");
    expect(container.querySelectorAll('tbody tr:nth-child(2) td')).toHaveLength(2);
  });
});

describe('WbwGlossSpan accessibility', () => {
  it('points every spanned word at the shared gloss', () => {
    // The gloss sits outside the links, so without aria-describedby a screen
    // reader tabbing the grid hears the transliteration and nothing else --
    // losing the meaning for exactly the words whose meaning is least
    // guessable. WbwWordCell keeps its gloss inside the link and needs none.
    const { container } = render(
      <WbwGlossSpan cells={[c(1, 'لَا', "shubha yo'q", 4), c(2, 'رَيْبَ', "shubha yo'q", 4)]} />,
    );
    const links = Array.from(container.querySelectorAll('a'));
    expect(links).toHaveLength(2);
    const ids = links.map((a) => a.getAttribute('aria-describedby'));
    // One shared gloss, so one shared id -- and it must actually resolve, or
    // the attribute points at nothing and announces nothing.
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBeTruthy();
    const target = container.querySelector(`#${ids[0]}`);
    expect(target).not.toBeNull();
    expect(target!.textContent).toContain("shubha yo'q");
  });
});
