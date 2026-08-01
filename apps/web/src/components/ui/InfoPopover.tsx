'use client';

import { useEffect, useId, useRef, useState } from 'react';

interface InfoPopoverProps {
  /** Accessible name for the trigger, e.g. "About these translations". Read in
   *  place of the glyph, so it has to name the note rather than be the note. */
  label: string;
  children: React.ReactNode;
}

/**
 * An "i" button that reveals a short explanatory note.
 *
 * Tap/click, not hover: this is a mobile-first PWA and hover does not exist on
 * a touchscreen, where a hover-only tooltip is either unreachable or fires on
 * the tap that was meant to scroll. A real `<button aria-expanded>` gets the
 * keyboard and screen-reader behaviour for free, and works the same on both.
 *
 * The panel is in the flow rather than absolutely positioned. A floating panel
 * needs collision detection to stay on a 360px viewport, and the note is one
 * sentence sitting directly under a section heading — pushing the content down
 * for the moment it is open costs nothing and cannot render off-screen.
 */
export function InfoPopover({ label, children }: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape and outside-tap both close. Bound only while open, so a page with
  // several of these has at most one pair of listeners attached.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    // `click`, not `pointerdown`. Closing removes an in-flow paragraph, so the
    // content below jumps up ~30px; on `pointerdown` that happens *between* a
    // tap's down and up, the finger lifts over a different element, and the
    // browser dispatches the click to the common ancestor instead of the link
    // that was aimed at — the first tap on anything under the note would be
    // swallowed. On `click` the layout is stable for the whole gesture.
    // The trigger is checked here too, so re-tapping it toggles via `onClick`
    // rather than closing and immediately reopening.
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        /* h-3.5/w-3.5 is the visible glyph; the negative-margin padding grows
           the hit area to 44px without moving the heading it sits beside — the
           glyph is small by design but the tap target may not be (WCAG 2.5.8,
           §8's AA floor). */
        className="relative -m-3 inline-flex h-11 w-11 items-center justify-center text-paper-600 transition-colors hover:text-paper-800 dark:text-paper-400 dark:hover:text-paper-200"
      >
        <span
          aria-hidden="true"
          className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current text-[9px] font-semibold leading-none"
        >
          i
        </span>
      </button>
      {/* Kept mounted and hidden, so the panel is in the accessibility tree for
          `aria-controls` to point at whether or not it is open. Both it and the
          button are direct children of the caller's flex row — a wrapper would
          need `display: contents` to keep that layout, and `contents` has a
          history of dropping its subtree out of the accessibility tree. Two
          refs cost less than that risk. */}
      <div
        ref={panelRef}
        id={id}
        hidden={!open}
        className="mt-2 basis-full text-xs text-paper-600 dark:text-paper-400"
      >
        {children}
      </div>
    </>
  );
}
