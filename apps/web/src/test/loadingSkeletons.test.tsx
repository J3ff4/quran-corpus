import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntryHeaderSkeleton } from '../components/dictionary/EntryHeaderSkeleton';
import { Skeleton } from '../components/ui/Skeleton';
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

// The shared masthead placeholder. Both branches are optional because the two
// entry pages disagree: roots have no transliteration, and either page can be
// asked for a header with no chip row at all. A branch that renders its wrapper
// unconditionally would leave the margin behind and shift the count line on
// swap, which is the one thing a skeleton exists to prevent.
describe('EntryHeaderSkeleton', () => {
  // Every bar is aria-hidden (Skeleton owns that), so counting roles is not an
  // option -- query the DOM the same way the component builds it.
  const bars = (c: HTMLElement) => c.querySelectorAll('div.animate-pulse');

  it('headword and count only, when neither slot is filled', () => {
    const { container } = render(<EntryHeaderSkeleton />);
    expect(bars(container)).toHaveLength(2);
    expect(container.querySelector('.flex.justify-center')).toBeNull();
  });

  it('adds the transliteration bar when flagged', () => {
    const { container } = render(<EntryHeaderSkeleton transliteration />);
    expect(bars(container)).toHaveLength(3);
  });

  it('wraps children in the centred row', () => {
    const { container } = render(
      <EntryHeaderSkeleton>
        <Skeleton className="h-9 w-9" />
        <Skeleton className="h-9 w-9" />
      </EntryHeaderSkeleton>,
    );
    const row = container.querySelector('.flex.justify-center');
    expect(row).not.toBeNull();
    expect(row!.children).toHaveLength(2);
    // Headword + two pills + count.
    expect(bars(container)).toHaveLength(4);
  });

  it('both slots together give the lemma shape', () => {
    const { container } = render(
      <EntryHeaderSkeleton transliteration>
        <Skeleton className="h-7 w-24 rounded-full" />
      </EntryHeaderSkeleton>,
    );
    expect(bars(container)).toHaveLength(4);
  });
});
