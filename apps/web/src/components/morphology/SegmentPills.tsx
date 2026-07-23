import type { WordSegment } from '@quran-corpus/data';
import { posColor } from '../../lib/posColor';

const SIZES = {
  sm: { word: 'text-2xl leading-[1.8]', label: 'text-[10px] leading-none', gap: 'gap-1' },
  lg: { word: 'text-6xl leading-[1.8]', label: 'text-xs leading-none', gap: 'gap-1.5' },
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

  const styled = segments.map((seg) => ({ seg, color: posColor(seg.pos_tag) }));

  return (
    <span className="flex flex-col items-center gap-1">
      {/* Segments stay adjacent inline spans (no boxes/gaps) so Arabic letter-joining renders correctly. */}
      <span dir="rtl">
        {styled.map(({ seg, color }) => (
          <span
            key={seg.id}
            className={`font-arabic ${s.word} ${color === null ? 'text-paper-900 dark:text-paper-100' : ''}`}
            style={color ? { color } : undefined}
          >
            {seg.form_arabic}
          </span>
        ))}
      </span>
      {/* No-color segments (DET) get no tag pill at all -- corpus.quran.com doesn't surface DET as its own category either. */}
      <span className={`flex flex-wrap items-center justify-center ${s.gap}`} dir="rtl">
        {styled
          .filter((x): x is { seg: WordSegment; color: string } => x.color !== null)
          .map(({ seg, color }) => (
            <span
              key={seg.id}
              className={`rounded-full px-1.5 py-0.5 font-medium leading-none ${s.label}`}
              style={{ color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
            >
              {seg.pos_tag}
            </span>
          ))}
      </span>
    </span>
  );
}
