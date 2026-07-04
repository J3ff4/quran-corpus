import type { WordSegment } from '@quran-corpus/data';
import { buckwalterToArabic } from '@quran-corpus/data';

interface SegmentCardProps {
  segment: WordSegment;
  index: number;
}

function parseFeatures(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return {};
  } catch {
    return {};
  }
}

const chip =
  'rounded-full bg-paper-200 px-2.5 py-0.5 text-xs text-paper-700 dark:bg-night-100 dark:text-paper-300';

export function SegmentCard({ segment, index }: SegmentCardProps) {
  const features = parseFeatures(segment.features_json);

  return (
    <div className="rounded-xl border border-paper-200 p-4 dark:border-night-100">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-paper-500">
          {index + 1}. {segment.segment_type ?? 'segment'}
        </span>
        {segment.pos_tag && <span className={`${chip} font-medium`}>{segment.pos_tag}</span>}
      </div>

      {Object.entries(features).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(features).map(([k, v]) => (
            <span key={k} className={chip}>
              {k}: {String(v)}
            </span>
          ))}
        </div>
      )}

      {(segment.root || segment.lemma) && (
        <div className="mt-2 flex flex-wrap gap-2" dir="rtl">
          {segment.root && (
            <span className="font-arabic text-sm text-paper-700 dark:text-paper-300">
              {buckwalterToArabic(segment.root)}
            </span>
          )}
          {segment.lemma && (
            <span className="font-arabic text-sm text-paper-700 dark:text-paper-300">
              {segment.lemma}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
