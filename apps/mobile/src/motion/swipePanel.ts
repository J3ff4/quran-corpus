// Every function here is a worklet, and every one takes its constants as
// explicit arguments rather than as defaults. Reanimated captures the
// identifiers a worklet's BODY references, and a constant that appears only in
// a default-parameter position is not among them: the panel rendered once and
// then threw `Property 'PANEL_GAP' doesn't exist` on the UI runtime, from a
// file where the constant is plainly in scope (device, 2026-08-31). Callers
// read the constants on the JS side, where they are ordinary module scope, and
// hand them in -- which is also what makes these testable without a runtime.

/** The delete panel's full width, in points. */
export const PANEL_WIDTH = 88;

/** The gap between the card's trailing edge and the panel. */
export const PANEL_GAP = 8;

/** How far the row must be dragged, as a fraction of the panel's own width,
 *  before the trash icon starts arriving. Below this the panel is a sliver,
 *  and an icon drawn into it is a smear rather than a symbol. */
export const ICON_THRESHOLD = 0.4;

/** The icon's size at the moment it starts appearing, as a fraction of full. */
export const ICON_MIN_SCALE = 0.6;

/**
 * How wide the panel is for a given row translation.
 *
 * The panel fills exactly the gap the row has opened behind it, so it reads as
 * something being uncovered rather than something that was already there. The
 * library gives us none of this: its right-actions container animates
 * `opacity: progress === 0 ? 0 : 1`, so a fixed-width panel snaps to full size
 * on the first pixel of drag and then sits under the returning card on the way
 * back -- which is the "already showing" and "disappears behind the card"
 * this replaces.
 *
 * `translation` is the row's own translateX and is negative for a right-side
 * swipe, so the revealed gap is its magnitude less the gap the panel keeps
 * from the card.
 *
 * Clamped at both ends: negative widths are not renderable, and past the
 * panel's own width the extra travel belongs to the overshoot, not to a panel
 * that would then be wider than the target it represents.
 */
export function panelWidth(translation: number, gap: number, max: number): number {
  'worklet';
  const revealed = -translation - gap;
  if (revealed <= 0) return 0;
  return revealed > max ? max : revealed;
}

/**
 * The icon's own 0..1 progress, which starts only once the panel is wide
 * enough to hold it.
 *
 * Rescaled rather than offset, so the icon still reaches full strength exactly
 * when the panel does -- an icon that arrives at 0.85 and then sits there for
 * the rest of the drag looks like it stopped loading.
 */
export function iconProgress(progress: number, threshold: number): number {
  'worklet';
  if (progress <= threshold) return 0;
  if (progress >= 1) return 1;
  return (progress - threshold) / (1 - threshold);
}

/** The icon's scale, from its OWN progress rather than the panel's: it grows in
 *  with the panel rather than appearing at full size inside a box still
 *  opening.
 *
 *  Takes the value `iconProgress` returned instead of calling it, for the same
 *  reason nothing here has default arguments -- see the note below. */
export function iconScale(iconProgressValue: number, minScale: number): number {
  'worklet';
  return minScale + (1 - minScale) * iconProgressValue;
}
