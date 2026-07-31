import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RootLoading from '../app/dictionary/[root]/loading';
import LemmaLoading from '../app/dictionary/lemma/[lemma]/loading';
import SurahLoading from '../app/surah/[id]/loading';
import WordsLoading from '../app/surah/[id]/words/loading';

// Route loading skeletons: render instantly while the dynamic page streams.
// Each must announce a busy/loading state for assistive tech and not throw.
describe('route loading skeletons', () => {
  it.each([
    ['dictionary/[root]', RootLoading],
    ['dictionary/lemma/[lemma]', LemmaLoading],
    ['surah/[id]', SurahLoading],
    ['surah/[id]/words', WordsLoading],
  ])('%s renders a busy loading region', (_name, Loading) => {
    render(<Loading />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
