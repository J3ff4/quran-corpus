'use client';

import { useEffect } from 'react';

/** Events that mean the reader took over. Passive: none of them are cancelled. */
const INTENT_EVENTS = ['wheel', 'touchstart', 'keydown'] as const;

function jumpTo(ayah: number): void {
  const el = document.getElementById(`ayah-${ayah}`);
  if (!el) return;
  try {
    // 'instant', not 'auto': ScrollBehavior 'auto' defers to the CSS
    // scroll-behavior, which globals.css sets to smooth. A smooth scroll picks
    // its destination once and never re-aims, so on a long surah it is the very
    // thing that lands the reader in the wrong place.
    el.scrollIntoView({ behavior: 'instant', block: 'start' });
  } catch {
    // 'instant' is a WebIDL enum member, so an engine that predates it throws
    // on the dictionary conversion rather than ignoring the value (Safari
    // < 15.4, Chrome < 97). Fall back to the boolean form, which still aligns
    // to the top — just smoothly, the way this did before.
    el.scrollIntoView(true);
  }
}

/**
 * Deep-link scroll for ?ayah=N.
 *
 * Scrolls twice on purpose. The Arabic faces load with `display: 'swap'`
 * (app/layout.tsx), so at hydration every ayah is still laid out in fallback
 * metrics — worst in the word-by-word views, where each ayah is a grid of
 * Arabic cells that re-wraps when the real font arrives. A single scroll on
 * mount aims at an offset that stops being true the moment the swap lands:
 * every block above the target changes height and the target slides out from
 * under the viewport. So jump immediately for the instant response, then
 * re-aim once `document.fonts.ready` says the swap is done and laid out.
 */
export function ScrollToAyah({ ayah }: { ayah: number }) {
  useEffect(() => {
    jumpTo(ayah);

    // Absent in some test environments; the first jump is still correct
    // whenever the font was already cached.
    const fonts = document.fonts;
    if (!fonts) return;

    // Skip the re-aim only when the reader has taken over, and read that from
    // input rather than from scrollY: the swap itself moves scrollY — the
    // browser clamps it against the new document height, and scroll anchoring
    // (on by default) adjusts it whenever content above the viewport resizes.
    // A position check would therefore bail out on exactly the long surahs the
    // second jump exists for.
    let cancelled = false;
    const stop = () => {
      cancelled = true;
    };
    for (const type of INTENT_EVENTS) {
      window.addEventListener(type, stop, { passive: true, once: true });
    }

    void fonts.ready.then(() => {
      if (!cancelled) jumpTo(ayah);
    });

    return () => {
      cancelled = true;
      for (const type of INTENT_EVENTS) window.removeEventListener(type, stop);
    };
  }, [ayah]);
  return null;
}
