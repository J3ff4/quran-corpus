import type { WordSegment } from '@quran-corpus/data';
import { posColor } from '../../lib/posColor';

const SIZES = {
  sm: { word: 'text-2xl leading-[1.8]', label: 'text-[10px] leading-none', gap: 'gap-0.5' },
  lg: { word: 'text-5xl leading-[1.8]', label: 'text-sm leading-none', gap: 'gap-1' },
};

export function SegmentPills({
  segments,
  fallbackWord,
  size = 'sm',
}: {
  segments: WordSegment[];
  fallbackWord: string;
  size?: 'sm' | 'lg';
}) {
  const s = SIZES[size];

  if (segments.length === 0 || segments.some((seg) => !seg.form_arabic)) {
    return (
      <span className={`font-arabic ${s.word} text-paper-900 dark:text-paper-100`} dir="rtl">
        {fallbackWord}
      </span>
    );
  }

  return (
    <span className={`flex flex-wrap items-end justify-end ${s.gap}`} dir="rtl">
      {segments.map((seg) => {
        const color = posColor(seg.pos_tag);
        return (
          <span
            key={seg.id}
            className="flex flex-col items-center rounded-md px-1 py-0.5"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
          >
            <span className={`font-arabic ${s.word}`} style={{ color }}>
              {seg.form_arabic ?? ''}
            </span>
            <span className={s.label} style={{ color }}>
              {seg.pos_tag ?? ''}
            </span>
          </span>
        );
      })}
    </span>
  );
}
