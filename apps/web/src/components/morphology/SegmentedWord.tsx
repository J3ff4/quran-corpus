import type { Word, WordSegment } from '@quran-corpus/data';
import { SegmentPills } from './SegmentPills';

interface SegmentedWordProps {
  word: Word;
  segments: WordSegment[];
  gloss?: string;
}

/**
 * Hero rendering of the word: each morphological segment colored by POS
 * (corpus-style), POS code pilled beneath it. Delegates to SegmentPills (the
 * same per-segment pill used in the wbw list view) at the large size so the
 * two stay visually and behaviorally consistent — one flex row per word, not
 * absolutely-positioned SVG text, so labels wrap instead of overlapping.
 *
 * `role="img"` + `aria-label` exposes one clean accessible name (word + gloss)
 * to assistive tech, while the underlying spans remain real, selectable,
 * searchable Unicode text for sighted/mouse/SEO use.
 */
export function SegmentedWord({ word, segments, gloss }: SegmentedWordProps) {
  const label = gloss ? `${word.text_arabic} — ${gloss}` : word.text_arabic;

  return (
    <div role="img" aria-label={label} className="flex justify-center">
      <SegmentPills segments={segments} fallbackWord={word.text_arabic} size="lg" />
    </div>
  );
}
