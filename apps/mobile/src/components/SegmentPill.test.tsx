import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WordSegment } from '@quran-corpus/data/mobile';
import { SegmentPill } from './SegmentPill';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';
import { rgb } from '@/testing/rgb';

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');

  return {
    Text: host('span'),
    View: host('div'),
  };
});

function segment(overrides: Partial<WordSegment> = {}): WordSegment {
  return {
    id: 1,
    word_id: 1,
    segment_index: 1,
    segment_type: 'stem',
    pos_tag: 'N',
    form_arabic: null,
    form_buckwalter: null,
    features_json: null,
    lemma: null,
    root: null,
    ...overrides,
  };
}

describe('SegmentPill', () => {
  afterEach(cleanup);

  it('labels the segment with its decoded POS, not its raw tag', () => {
    render(<SegmentPill segment={segment({ pos_tag: 'PN' })} />);

    // A raw "PN" tells a reader nothing; decodeSegment is the shared decoder
    // both products already use.
    expect(screen.getByText(/proper noun/i)).toBeTruthy();
    expect(screen.queryByText('PN')).toBeNull();
  });

  it('colours the label by bucket', () => {
    render(<SegmentPill segment={segment({ pos_tag: 'V' })} />);

    expect(screen.getByText(/verb/i).style.color).toBe(rgb(themeColors.light.pos.verb));
  });

  it('gives two buckets two different colours', () => {
    // Reading the colour off one pill passes just as well if every bucket
    // resolves to the same hex, which is what a mis-keyed lookup produces.
    render(<SegmentPill segment={segment({ pos_tag: 'V' })} />);
    render(<SegmentPill segment={segment({ pos_tag: 'P' })} />);

    expect(screen.getByText(/^verb$/i).style.color).not.toBe(
      screen.getByText(/preposition/i).style.color,
    );
  });

  it('renders DET without a bucket colour', () => {
    // posBucket returns null for DET deliberately -- see its own test. The
    // pill must fall back to body text, not to the `other` grey.
    render(<SegmentPill segment={segment({ pos_tag: 'DET' })} />);

    const { color } = screen.getByText(/determiner/i).style;
    expect(color).not.toBe(rgb(themeColors.light.pos.other));
    expect(color).toBe(rgb(themeColors.light.text));
  });

  it('takes its colours from the theme, not a hardcoded hex', () => {
    render(
      <ThemeContext.Provider value={themeColors.dark}>
        <SegmentPill segment={segment({ pos_tag: 'V' })} />
      </ThemeContext.Provider>,
    );

    expect(screen.getByText(/verb/i).style.color).toBe(rgb(themeColors.dark.pos.verb));
  });

  it('shows the segment Arabic when the corpus has it', () => {
    render(<SegmentPill segment={segment({ form_arabic: 'ٱل' })} />);

    expect(screen.getByText('ٱل')).toBeTruthy();
  });

  it('tints the segment Arabic, not only its label', () => {
    render(<SegmentPill segment={segment({ pos_tag: 'V', form_arabic: 'قَالَ' })} />);

    const [arabic, label] = screen.getAllByTestId('segment-pill-text');
    expect(arabic!.style.color).toBe(rgb(themeColors.light.pos.verb));
    expect(label!.style.color).toBe(rgb(themeColors.light.pos.verb));
  });

  it('omits the Arabic line rather than rendering an empty one', () => {
    // form_arabic is null on some segments; an empty <Text> leaves a blank
    // row that reads as a rendering bug.
    const { container } = render(<SegmentPill segment={segment({ form_arabic: null })} />);

    expect(container.querySelectorAll('span')).toHaveLength(1);
  });
});
