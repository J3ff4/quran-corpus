import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WordToken } from '../components/reader/WordToken';
import type { Word } from '@quran-corpus/data';

const word: Word = {
  id: 1,
  ayah_id: 1,
  position: 1,
  text_arabic: 'بِسْمِ',
  transliteration: 'bismi',
  root: null,
  lemma: null,
  root_buckwalter: null,
  lemma_buckwalter: null,
  pos_tag: 'P',
  morphology_json: '["P","N"]',
  morphology_description: null,
  grammar_arabic: null,
  audio_url: null,
};

describe('WordToken', () => {
  it('renders the Arabic text', () => {
    render(<WordToken word={word} onClick={vi.fn()} />);
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
  });

  it('calls onClick with word when clicked', () => {
    const onClick = vi.fn();
    render(<WordToken word={word} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledWith(word);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders as a button', () => {
    render(<WordToken word={word} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
