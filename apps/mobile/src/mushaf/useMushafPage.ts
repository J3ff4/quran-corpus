import { useEffect, useState } from 'react';
import { getMushafPage, type MushafLine } from '@quran-corpus/data/mobile';
import type { MobileDataClient } from '@quran-corpus/mobile-data';

export interface MushafPageData {
  lines: MushafLine[];
  /** The page `lines` belong to, or null while none have settled.
   *
   *  Not redundant with the `page` argument. The render in which the pager
   *  reports a turn still carries the PREVIOUS page's rows -- this hook's
   *  effect has not run yet -- so `lines` is non-empty and describes a page the
   *  reader has left. A caller that only acts on the rows of the page in front
   *  of the reader (starting its first ayah) has to compare this, not
   *  `lines.length`. */
  page: number | null;
  loading: boolean;
  error: Error | null;
}

/**
 * One page's layout rows.
 *
 * The page changes under this hook constantly -- the pager keeps its
 * neighbours warm and swipes faster than SQLite answers -- so it carries the
 * same cancelled flag `useMushafPageFont` does: a slower query for a page the
 * reader has already left must not overwrite the page they are on.
 *
 * `loading` starts true and is only cleared by a settled query, because a
 * false here means "there is nothing to show", which the pager would draw as
 * an empty page rather than as a page still arriving (the bookmark-delete jump
 * of M6, in another costume).
 */
export function useMushafPage(client: MobileDataClient | null, page: number): MushafPageData {
  const [state, setState] = useState<MushafPageData>({
    lines: [],
    page: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!client) {
      setState({ lines: [], page: null, loading: true, error: null });
      return;
    }
    let cancelled = false;
    setState({ lines: [], page: null, loading: true, error: null });
    getMushafPage(client, page)
      .then((lines) => {
        if (!cancelled) setState({ lines, page, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            lines: [],
            page: null,
            loading: false,
            error: e instanceof Error ? e : new Error(String(e)),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, page]);

  return state;
}
