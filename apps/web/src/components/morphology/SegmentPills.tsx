import type { WordSegment } from '@quran-corpus/data';
import { posColor } from '../../lib/posColor';

export function SegmentPills({
  segments,
  fallbackWord,
}: {
  segments: WordSegment[];
  fallbackWord: string;
}) {
  if (segments.length === 0 || segments.some((seg) => !seg.form_arabic)) {
    return (
      <span className="font-arabic text-2xl leading-[1.8] text-paper-900 dark:text-paper-100" dir="rtl">
        {fallbackWord}
      </span>
    );
  }

  return (
    <span className="flex items-end gap-0.5" dir="rtl">
      {segments.map((seg) => {
        const color = posColor(seg.pos_tag);
        return (
          <span
            key={seg.id}
            className="flex flex-col items-center rounded-md px-1 py-0.5"
            style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
          >
            <span className="font-arabic text-2xl leading-[1.8]" style={{ color }}>
              {seg.form_arabic ?? ''}
            </span>
            <span className="text-[10px] leading-none" style={{ color }}>
              {seg.pos_tag ?? ''}
            </span>
          </span>
        );
      })}
    </span>
  );
}
