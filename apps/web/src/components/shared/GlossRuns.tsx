import { Fragment } from 'react';
import { splitGlossBrackets } from '@quran-corpus/data/client';

/** A gloss with its bracketed asides dimmed. Colour only, no size change (R13). The
 *  class is AA >= 4.5:1 on every host's background, measured in the M13 plan. */
const DIM = 'text-paper-600 dark:text-paper-400';

export function GlossRuns({ gloss }: { gloss: string }) {
  return (
    <>
      {splitGlossBrackets(gloss).map((run, i) =>
        run.dim ? (
          <span key={i} className={DIM}>
            {run.text}
          </span>
        ) : (
          <Fragment key={i}>{run.text}</Fragment>
        ),
      )}
    </>
  );
}
