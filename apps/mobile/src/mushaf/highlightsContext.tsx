import { createContext, useContext, type ReactNode } from 'react';

import type { HighlightInput } from './highlights';

const EMPTY: HighlightInput = {
  bookmarked: new Set<string>(),
  landing: null,
  playing: null,
  landingProgress: 0,
  pressed: null,
};

const HighlightsContext = createContext<HighlightInput>(EMPTY);

/**
 * The reader's marks, delivered to the drawn pages by context rather than by
 * prop.
 *
 * Not a style choice: `MushafPager` hands PagerView all 604 children, and
 * PagerView is a plain `React.Component` that runs `Children.map` +
 * `cloneElement` over every one of them on each of its own renders. As a prop,
 * `highlights` made the pager re-render on every step of the landing pulse --
 * six in ~900ms, plus one per ayah during recitation -- so a single pulse tick
 * cost ~1800 element allocations. The FlatList this replaced never paid that:
 * it only called `renderItem` for the pages it had mounted.
 *
 * Through context the marks reach the two or three pages that actually draw
 * without the pager above them re-rendering at all, which is what lets
 * `MushafPager` be memoised.
 */
export function HighlightsProvider({
  value,
  children,
}: {
  value: HighlightInput;
  children: ReactNode;
}) {
  return <HighlightsContext.Provider value={value}>{children}</HighlightsContext.Provider>;
}

export function useHighlights(): HighlightInput {
  return useContext(HighlightsContext);
}
