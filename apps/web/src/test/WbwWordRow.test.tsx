import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WbwWordRow } from '../components/wbw/WbwWordRow';
import type { WbwCell } from '../components/wbw/types';

function cell(over: Partial<WbwCell> = {}): WbwCell {
  return {
    surahId: 1, ayahNumber: 1, position: 1,
    arabic: 'بِسْمِ', translit: "bis'mi", gloss: 'In (the) name', glossLang: null,
    posTag: 'P', posLabel: 'Preposition',
    segments: [],
    grammarArabic: 'جار ومجرور',
    ...over,
  };
}

function renderRow(cellProps: WbwCell, pageLang?: string) {
  return render(
    <table>
      <tbody>
        <WbwWordRow cell={cellProps} {...(pageLang ? { pageLang } : {})} />
      </tbody>
    </table>,
  );
}

describe('WbwWordRow', () => {
  it('renders translation, arabic, and a short POS code/label + grammar term (no full-analysis)', () => {
    renderRow(cell());
    expect(screen.getByText('In (the) name')).toBeInTheDocument();
    expect(screen.getByText("bis'mi")).toBeInTheDocument();
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
    expect(screen.getByText('P – Preposition')).toBeInTheDocument();
    expect(screen.getByText('جار ومجرور')).toBeInTheDocument();
    expect(screen.getByText('(1:1:1)')).toBeInTheDocument();
  });

  it('links the arabic word to the word detail page', () => {
    renderRow(cell({ surahId: 2, ayahNumber: 255, position: 1 }));
    expect(screen.getByRole('link')).toHaveAttribute('href', '/word/2/255/1');
  });

  it('shows em dash for null translit/gloss/posTag+posLabel/grammarArabic', () => {
    renderRow(
      cell({ translit: null, gloss: null, posTag: null, posLabel: null, grammarArabic: null }),
    );
    expect(screen.getAllByText('—').length).toBe(4);
    expect(screen.queryByText('جار ومجرور')).toBeNull();
  });

  it('renders one POS code/label line per segment instead of the full scraped description', () => {
    renderRow(
      cell({
        segments: [
          {
            id: 1, word_id: 1, segment_index: 0, segment_type: 'prefix',
            pos_tag: 'P', form_arabic: 'بِ', form_buckwalter: null,
            features_json: null, lemma: null, root: null,
          },
          {
            id: 2, word_id: 1, segment_index: 1, segment_type: 'stem',
            pos_tag: 'N', form_arabic: 'سْمِ', form_buckwalter: null,
            features_json: null, lemma: null, root: null,
          },
        ],
      }),
    );
    expect(screen.getByText('P – Preposition')).toBeInTheDocument();
    expect(screen.getByText('N – Noun')).toBeInTheDocument();
  });

  it('falls back to the word-level POS code/label when any segment has a null pos_tag', () => {
    renderRow(
      cell({
        segments: [
          {
            id: 1, word_id: 1, segment_index: 0, segment_type: 'prefix',
            pos_tag: 'P', form_arabic: 'بِ', form_buckwalter: null,
            features_json: null, lemma: null, root: null,
          },
          {
            id: 2, word_id: 1, segment_index: 1, segment_type: 'stem',
            pos_tag: null, form_arabic: 'سْمِ', form_buckwalter: null,
            features_json: null, lemma: null, root: null,
          },
        ],
      }),
    );
    expect(screen.queryByText(/–\s*\?/)).toBeNull();
    expect(screen.getByText('P – Preposition')).toBeInTheDocument();
  });

  it('marks an EN-fallback gloss while viewing uz, same as the card cell', () => {
    renderRow(cell({ gloss: 'Allah', glossLang: 'en' }), 'uz');
    expect(screen.getByText(/\(en\)/i)).toBeInTheDocument();
  });

  it('renders SegmentPills in the arabic-word column when the cell has segments', () => {
    renderRow(
      cell({
        segments: [
          {
            id: 1, word_id: 1, segment_index: 0, segment_type: 'prefix',
            pos_tag: 'P', form_arabic: 'بِ', form_buckwalter: null,
            features_json: null, lemma: null, root: null,
          },
        ],
      }),
    );
    expect(screen.getByText('بِ')).toBeInTheDocument();
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('falls back to the flat arabic word when segments is empty', () => {
    renderRow(cell({ segments: [] }));
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
  });
});
