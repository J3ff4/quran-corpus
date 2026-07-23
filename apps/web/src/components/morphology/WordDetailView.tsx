import Link from 'next/link';
import type { WordDetail } from '@quran-corpus/data';
import { decodeSegment } from '@quran-corpus/data';
import { SegmentedWord } from './SegmentedWord';
import { MorphologySummary } from './MorphologySummary';
import { SegmentCard } from './SegmentCard';
import { FullAnalysis } from './FullAnalysis';

interface WordDetailViewProps {
  detail: WordDetail;
  gloss?: string;
  rootHref?: string;
}

export function WordDetailView({ detail, gloss, rootHref }: WordDetailViewProps) {
  const { word, segments, concept_tags } = detail;
  const orderedSegments = [...segments].sort((a, b) => a.segment_index - b.segment_index);
  const decoded = orderedSegments.map((seg) => ({ id: seg.id, decoded: decodeSegment(seg) }));

  return (
    <article className="space-y-8">
      <header className="mx-auto max-w-md">
        <SegmentedWord word={word} segments={orderedSegments} {...(gloss ? { gloss } : {})} />
      </header>

      <MorphologySummary word={word} {...(gloss ? { gloss } : {})} />

      {decoded.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-paper-500">
            Segments
          </h2>
          <div className="space-y-3">
            {decoded.map((d, i) => (
              <SegmentCard key={d.id} segment={d.decoded} index={i} />
            ))}
          </div>
        </section>
      )}

      <FullAnalysis
        {...(word.morphology_description ? { description: word.morphology_description } : {})}
        {...(word.grammar_note ? { grammarNote: word.grammar_note } : {})}
      />

      {concept_tags.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-paper-500">
            Concepts
          </h2>
          <div className="flex flex-wrap gap-2">
            {concept_tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-paper-200 px-3 py-1 text-sm text-paper-700 dark:bg-night-100 dark:text-paper-300"
              >
                {tag.tag_label}
              </span>
            ))}
          </div>
        </section>
      )}

      {rootHref && (
        <Link
          href={rootHref}
          className="inline-flex items-center gap-1 rounded-full bg-paper-900 px-4 py-2 text-sm font-medium text-paper-50 transition-colors hover:bg-paper-700 dark:bg-paper-100 dark:text-night-200"
        >
          View root in dictionary →
        </Link>
      )}
    </article>
  );
}
