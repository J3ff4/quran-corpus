import type { DecodedSegment } from '@quran-corpus/data';
import { chip } from '../ui/chip';

interface SegmentCardProps {
  segment: DecodedSegment;
  index: number;
}

export function SegmentCard({ segment, index }: SegmentCardProps) {
  const { role, pos, features, rootArabic, lemma, unknownTags } = segment;

  return (
    <div className="rounded-xl border border-paper-200 p-4 dark:border-night-100">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-paper-500">
          {index + 1}. {role}
        </span>
        <span className={`${chip} font-medium`}>{pos.en}</span>
        {pos.ar && (
          <span className={`${chip} font-arabic`} dir="rtl">
            {pos.ar}
          </span>
        )}
      </div>

      {features.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {features.map((f, i) => (
            <span key={`${f.key}-${i}`} className={chip}>
              {f.label ? (
                <>
                  <span className="font-medium">{f.label}</span>: <span>{f.value}</span>
                </>
              ) : (
                f.value
              )}
            </span>
          ))}
        </div>
      )}

      {unknownTags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {unknownTags.map((t, i) => (
            <span key={`${t}-${i}`} className={`${chip} font-mono`}>
              {t}
            </span>
          ))}
        </div>
      )}

      {(rootArabic || lemma) && (
        <div className="mt-2 flex flex-wrap gap-2" dir="rtl">
          {rootArabic && (
            <span className="font-arabic text-sm text-paper-700 dark:text-paper-300">
              {rootArabic}
            </span>
          )}
          {lemma && (
            <span className="font-arabic text-sm text-paper-700 dark:text-paper-300">
              {lemma}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
