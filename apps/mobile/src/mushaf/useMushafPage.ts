import { useEffect, useState } from 'react';
import { getMushafPage, type MushafLine } from '@quran-corpus/data/mobile';
import type { MobileDataClient } from '@quran-corpus/mobile-data';

export interface MushafPageData {
  lines: MushafLine[];
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
  const [state, setState] = useState<MushafPageData>({ lines: [], loading: true, error: null });

  useEffect(() => {
    if (!client) {
      setState({ lines: [], loading: true, error: null });
      return;
    }
    let cancelled = false;
    setState({ lines: [], loading: true, error: null });
    getMushafPage(client, page)
      .then((lines) => {
        if (!cancelled) setState({ lines, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({
            lines: [],
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
