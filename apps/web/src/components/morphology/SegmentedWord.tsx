'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { Word, WordSegment } from '@quran-corpus/data';
import { posColor } from '../../lib/posColor';

interface SegmentedWordProps {
  word: Word;
  segments: WordSegment[];
  gloss?: string;
}

// SVG coordinate space (viewBox). Width is nominal; the SVG scales to its box.
const VW = 640;
const VH = 112;
const WORD_Y = 60;
const LABEL_Y = 96;
const CX = VW / 2;
// Fallback text extent used before glyph measurement (SSR/jsdom) or if it fails.
const FALLBACK_EXTENT = VW * 0.9;

/**
 * Text-based SVG of the joined Arabic word, each morphological segment colored
 * by POS (corpus-style), with the POS code labelled beneath each segment.
 *
 * Glyphs are real `<text>`/`<tspan>` Unicode (not converted paths) so the word
 * stays selectable, searchable and screen-reader readable. A single `<text>`
 * holds all tspans so Arabic joining is preserved across color boundaries.
 * Label x-positions come from measuring each tspan on mount; before measurement
 * (and in jsdom) an even split keeps rendering deterministic.
 */
export function SegmentedWord({ word, segments, gloss }: SegmentedWordProps) {
  const tspanRefs = useRef<(SVGTSpanElement | null)[]>([]);
  const [widths, setWidths] = useState<number[] | null>(null);
  const hasSegments = segments.length > 0;
  const label = gloss ? `${word.text_arabic} — ${gloss}` : word.text_arabic;

  useLayoutEffect(() => {
    if (!hasSegments) return;
    const measured = segments.map((_, i) => {
      const el = tspanRefs.current[i];
      const len =
        el && typeof el.getComputedTextLength === 'function' ? el.getComputedTextLength() : 0;
      return Number.isFinite(len) && len > 0 ? len : 0;
    });
    setWidths(measured.reduce((a, b) => a + b, 0) > 0 ? measured : null);
  }, [segments, hasSegments]);

  // Per-segment center x, laid out RTL (segment 0 sits at the right edge).
  const n = segments.length;
  const w = widths ?? segments.map(() => FALLBACK_EXTENT / (n || 1));
  const extent = w.reduce((a, b) => a + b, 0);
  const rightEdge = CX + extent / 2;
  let cursor = rightEdge;
  const centers = w.map((wi) => {
    const center = cursor - wi / 2;
    cursor -= wi;
    return center;
  });

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${VW} ${VH}`}
      className="h-auto w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <title>{label}</title>
      {hasSegments ? (
        <>
          <text
            x={CX}
            y={WORD_Y}
            style={{ direction: 'rtl' }}
            textAnchor="middle"
            className="font-arabic"
            fontSize={48}
          >
            {segments.map((seg, i) => (
              <tspan
                key={seg.id}
                ref={(el) => {
                  tspanRefs.current[i] = el;
                }}
                fill={posColor(seg.pos_tag)}
              >
                {seg.form_arabic ?? ''}
              </tspan>
            ))}
          </text>
          {segments.map((seg, i) => (
            <text
              key={seg.id}
              x={centers[i]}
              y={LABEL_Y}
              textAnchor="middle"
              fontSize={16}
              fill={posColor(seg.pos_tag)}
            >
              {seg.pos_tag ?? ''}
            </text>
          ))}
        </>
      ) : (
        <text
          x={CX}
          y={WORD_Y}
          style={{ direction: 'rtl' }}
          textAnchor="middle"
          className="font-arabic"
          fontSize={48}
          fill="var(--pos-other)"
        >
          {word.text_arabic}
        </text>
      )}
    </svg>
  );
}
