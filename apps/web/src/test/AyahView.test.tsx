import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AyahView } from '../components/reader/AyahView';
import type { Ayah, Word, Translation } from '@quran-corpus/data';

const ayah: Ayah = {
  id: 1,
  surah_id: 1,
  ayah_number: 1,
  text_uthmani: 'بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ',
  text_simple: null,
  juz: 1,
  page: 1,
  audio_url: null,
};

const words: Word[] = [
  { id: 1, ayah_id: 1, position: 1, text_arabic: 'بِسْمِ', transliteration: 'bismi', root: null, lemma: null, root_buckwalter: null, lemma_buckwalter: null, pos_tag: 'P', morphology_json: null, morphology_description: null, grammar_arabic: null, audio_url: null },
  { id: 2, ayah_id: 1, position: 2, text_arabic: 'ٱللَّهِ', transliteration: 'l-lahi', root: null, lemma: null, root_buckwalter: null, lemma_buckwalter: null, pos_tag: 'PN', morphology_json: null, morphology_description: null, grammar_arabic: null, audio_url: null },
];

const sajdahAyah: Ayah = {
  id: 2,
  surah_id: 96,
  ayah_number: 19,
  text_uthmani: 'كَلَّا لَا تُطِعْهُ وَٱسْجُدْ وَٱقْتَرِب ۩',
  text_simple: null,
  juz: 30,
  page: 597,
  audio_url: null,
};

const sajdahWords: Word[] = [
  { id: 3, ayah_id: 2, position: 1, text_arabic: 'وَٱسْجُدْ', transliteration: null, root: null, lemma: null, root_buckwalter: null, lemma_buckwalter: null, pos_tag: null, morphology_json: null, morphology_description: null, grammar_arabic: null, audio_url: null },
];

const translation: Translation = {
  id: 1,
  ayah_id: 1,
  language_code: 'en',
  translator: 'Sahih International',
  text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
};

const audioProps = {
  isThisPlaying: false,
  isPlaying: false,
  isRepeat: false,
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onToggleRepeat: vi.fn(),
};

describe('AyahView', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders ayah number badge', () => {
    render(<AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders word tokens when words are provided', () => {
    render(<AyahView ayah={ayah} words={words} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
    expect(screen.getByText('ٱللَّهِ')).toBeInTheDocument();
  });

  it('falls back to text_uthmani block when no words', () => {
    render(<AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.getByText(ayah.text_uthmani)).toBeInTheDocument();
  });

  it('calls onWordClick when a word token is clicked', () => {
    const onWordClick = vi.fn();
    render(<AyahView ayah={ayah} words={words} onWordClick={onWordClick} {...audioProps} />);
    fireEvent.click(screen.getByText('بِسْمِ'));
    expect(onWordClick).toHaveBeenCalledWith(words[0]);
  });

  it('renders translation when provided', () => {
    render(<AyahView ayah={ayah} words={[]} translation={translation} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.getByText(translation.text)).toBeInTheDocument();
  });

  it('renders nothing for translation when not provided', () => {
    render(<AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.queryByText(translation.text)).toBeNull();
  });

  it('renders play button for the ayah', () => {
    render(<AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.getByRole('button', { name: /play ayah 1/i })).toBeInTheDocument();
  });

  it('renders a bookmark button', () => {
    render(<AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.getByRole('button', { name: /bookmark ayah 1/i })).toBeInTheDocument();
  });

  it('sets the scroll-anchor id on the article', () => {
    const { container } = render(
      <AyahView ayah={ayah} words={[]} onWordClick={vi.fn()} {...audioProps} />,
    );
    expect(container.querySelector('#ayah-1')).not.toBeNull();
  });

  it('shows the sajdah mark for a prostration ayah', () => {
    render(<AyahView ayah={sajdahAyah} words={sajdahWords} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.getByLabelText('Verse of Prostration (Sajdah)')).toBeInTheDocument();
  });

  it('does not show the sajdah mark for a non-prostration ayah', () => {
    render(<AyahView ayah={ayah} words={words} onWordClick={vi.fn()} {...audioProps} />);
    expect(screen.queryByLabelText('Verse of Prostration (Sajdah)')).toBeNull();
  });
});
