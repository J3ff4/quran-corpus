'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

interface ClampedTextProps {
  children: React.ReactNode;
  /** Lines shown while collapsed. */
  lines?: number;
  /** Rendered on the left of the toggle's row, e.g. the source credit. Shares
   *  the row so the credit and the toggle cost one line between them instead of
   *  one each, and the toggle is pushed to the trailing edge where a thumb
   *  already is. Rendered whether or not the text overflows. */
  footer?: React.ReactNode;
  /** Line height the clamp height is computed from; must match the rendered
   *  text's leading (Tailwind `leading-relaxed` = 1.625). */
  lineHeight?: number;
  /** Accessible name for the toggle, e.g. "root definition". */
  label: string;
  className?: string;
}

/**
 * Collapses long prose to `lines` with a fade-out edge and a Show more/less
 * toggle, and gets out of the way entirely when the text already fits.
 *
 * The clamp is a plain `max-height` in `em`, applied by the server-rendered
 * markup, so long text is already cropped in the first paint — there is no
 * frame where the full definition renders and then collapses. Only the
 * *toggle* is client-decided, because whether text overflows depends on the
 * rendered width and cannot be known on the server: definition lengths run
 * continuously from 4 to 1479 characters (p50 124, p90 401), so a
 * character-count guess would put a "Show more" that expands nothing on the
 * boxes nearest the threshold. Measuring is exact; the cost is that the button
 * appears one frame after hydration, which is the safe direction to be wrong.
 */
export function ClampedText({
  children,
  lines = 6,
  lineHeight = 1.625,
  label,
  className,
  footer,
}: ClampedTextProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  // Explicit px height only while an opening transition is in flight.
  // `max-height` can only animate between two lengths, but the resting expanded
  // state must be intrinsic — a definition is up to 1479 characters and any
  // fixed ceiling we guessed could crop one. So: animate to a measured px, then
  // release to `undefined` and let the box size to its content.
  // Boxed, not a bare number: a re-open usually measures the *same* height as
  // the previous one, and React bails on an equal value — the release effect
  // below would not re-run and the second open would inherit the first open's
  // already-running timer, dropping the ceiling mid-transition. A fresh object
  // every open is never equal, so every open arms its own timer.
  const [animatingTo, setAnimatingTo] = useState<{ px: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  const collapsedHeight = `${lines * lineHeight}em`;

  // Layout effect, not effect: this runs before paint, so on the rare fast
  // hydration the button is there from the first frame the user could see.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Compare the full content height against the height the CLAMP would
    // impose -- deliberately not against the element's current clientHeight.
    // scrollHeight ignores max-height clipping, so both terms are the same
    // whether the box is open or shut, which is what makes this safe to re-run
    // at any moment. Measuring `scrollHeight > clientHeight` instead would
    // read false the instant an expansion finished (the two are equal once the
    // ceiling lifts) and delete the "Show less" button out from under the user.
    const measure = () => {
      const px = parseFloat(getComputedStyle(el).fontSize) || 16;
      setOverflows(el.scrollHeight > lines * lineHeight * px + 1);
    };
    measure();
    // The first measure runs against fallback font metrics -- the faces load
    // with `display: swap` -- and the swap re-wraps the text. The observer
    // below does NOT catch that: while collapsed the box height is pinned by
    // `max-height`, so a content-only height change never alters the observed
    // box and no callback fires. If the fallback face fit inside the clamp and
    // the real one does not, the reader is left with a definition cropped by
    // `overflow: hidden`, no fade, no scrollbar and no toggle -- the exact
    // state the noscript escape hatch exists to prevent. So re-measure once
    // the real metrics land.
    let live = true;
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(() => {
        if (live) measure();
      });
    }
    // Rotating the phone or resizing re-flows the text: a definition that
    // overflowed at 375px may fit at 768px, and a stale `overflows` would
    // strand a toggle that no longer does anything.
    // Guarded — jsdom and older Safari have no ResizeObserver.
    if (typeof ResizeObserver === 'undefined') {
      return () => {
        live = false;
      };
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      live = false;
      ro.disconnect();
    };
    // `children` is in the deps because this effect's whole job is to measure
    // them: without it, swapping the content of a mounted instance keeps the
    // mount-time verdict and either strands a toggle that expands nothing or
    // crops the new text with no toggle at all. Not reachable today -- the
    // dictionary pages key on the route param and each definition keys on its
    // id, so every content change is a remount -- but that is the caller's
    // accident, not this component's guarantee. Compared by reference, so a
    // parent re-render re-measures; that is one read of scrollHeight and a
    // setState that bails when the value is unchanged.
  }, [lines, lineHeight, children]);

  // transitionend is the normal release, but it is not guaranteed to arrive.
  // `prefers-reduced-motion` sets `transition: none` on `.clamp-box`
  // (globals.css), so opening under reduced motion fires no event at all — and
  // an interrupted transition can be retargeted without one either. A pinned
  // `animatingTo` outlives the click that set it: a later reflow (phone
  // rotated, browser text size bumped, Arabic web font swapping in late)
  // re-wraps the text taller than that stale ceiling, and `overflow: hidden`
  // then crops the tail with no scrollbar and no way to reach it. Belt to
  // transitionend's braces.
  useEffect(() => {
    if (animatingTo === null) return;
    const t = setTimeout(() => setAnimatingTo(null), 500); // > the 240ms in globals.css
    return () => clearTimeout(t);
  }, [animatingTo]);

  function toggle() {
    const el = ref.current;
    if (!el) return;
    // Only opening measures a target. `max-height` interpolates between two
    // lengths and the resting expanded state is `none`, which is not a length —
    // so a close from rest snaps however it is measured, and pinning a start
    // height it cannot use would only create a ceiling that must be unpinned
    // again. Closing *mid-open* still animates: `animatingTo` is already a px
    // value then, and px → the clamp interpolates fine.
    if (!expanded) setAnimatingTo({ px: el.scrollHeight });
    setExpanded((v) => !v);
  }

  const clamped = !expanded && overflows;
  const mask = 'linear-gradient(to bottom, #000 65%, transparent)';

  // While animating, both states are a concrete px height so the transition has
  // two lengths to interpolate between.
  let maxHeight: string | undefined;
  if (animatingTo !== null) maxHeight = expanded ? `${animatingTo.px}px` : collapsedHeight;
  else if (!expanded) maxHeight = collapsedHeight;

  return (
    <>
      <div
        ref={ref}
        id={id}
        className={className ? `clamp-box ${className}` : 'clamp-box'}
        onTransitionEnd={(e) => {
          if (e.propertyName === 'max-height') setAnimatingTo(null);
        }}
        style={{
          maxHeight,
          // `hidden` only once the client has measured and put a button up.
          // Until then the clamp is server-rendered but nothing can open it, so
          // `hidden` there would crop a 1479-character definition with no fade,
          // no scrollbar and no toggle. The <noscript> hatch in layout.tsx
          // covers scripting *disabled*; it does not cover scripting *enabled
          // and broken* — a 404'd chunk, a blocked bundle, or a hydration error
          // swallowed by an error boundary all leave the markup in exactly this
          // state with no rule to release it. `auto` keeps the text reachable in
          // every one of those, and costs nothing in the normal case: content
          // that fits shows no scrollbar, and content that doesn't flips to
          // `hidden` the moment the layout effect runs.
          overflow: maxHeight === undefined ? undefined : overflows ? 'hidden' : 'auto',
          // Fade the last line out instead of guillotining a row of letters —
          // that soft edge is what signals "there is more" before the button is
          // read. Dropped as soon as the box opens.
          maskImage: clamped ? mask : undefined,
          WebkitMaskImage: clamped ? mask : undefined,
        }}
      >
        {children}
      </div>
      {/* A row, not two stacked blocks: the credit sits at the leading edge and
          the toggle at the trailing one, so together they cost the single line
          the toggle used to cost alone. `justify-between` with an always-present
          left cell, so the toggle lands in the same place whether or not there
          is a footer to balance it against — otherwise a footerless card would
          put "Show more" on the left and a credited one on the right.

          The row itself is `block`-level, which is what keeps a following
          sibling (the lemma page's "View root" link) off this line; inline, the
          two ran together as "Show more ▾View root".

          `items-baseline` so the credit and the toggle sit on one text baseline
          despite the toggle's larger tap target. `flex-wrap` + `gap` for the
          narrow case: a long credit and the toggle wrap to two lines rather
          than squeezing each other. */}
      {(footer || overflows) && (
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span>{footer}</span>
          {overflows && (
            /* `shrink-0` so the toggle keeps its full label when the footer is
               long; the :active scale(0.97) reads as a press because the box is
               the width of the label rather than of the card. */
            <button
              type="button"
              onClick={toggle}
              aria-expanded={expanded}
              aria-controls={id}
              className="clamp-toggle shrink-0 text-xs text-accent-700 underline-offset-2 hover:underline dark:text-accent-300"
            >
              {expanded ? 'Show less' : 'Show more'}
              <span aria-hidden="true"> {expanded ? '▴' : '▾'}</span>
              <span className="sr-only"> {label}</span>
            </button>
          )}
        </div>
      )}
    </>
  );
}
