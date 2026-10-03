/**
 * A page another tab has asked the mushaf to open on -- today only Home's
 * khatm card, which is a promise about one page and cannot be kept by the
 * saved reading position (the khatm mark is deliberately NOT that position).
 *
 * Module state rather than a route param, following `chromeVisibility` beside
 * it. The mushaf is a TAB, so it stays mounted once visited: a param pushed at
 * it sticks to the route for the rest of the session, and a second tap on the
 * same card would then be a param that never changes and so moves nothing --
 * the identical trap `setFocusPage` documents for its own prop. A request that
 * is consumed once has no stale value to re-fire and nothing to put in a URL.
 *
 * `take` clears it, so it is honoured by exactly one mushaf focus. A request
 * whose navigation never happens is therefore carried to the next time the tab
 * is opened by hand, which is the one loose end here: the writer navigates in
 * the same tap, so the window is a frame wide.
 */
let pending: number | null = null;

/** 1..604, guaranteed by `getKhatmPage`, which range-checks the row on the way
 *  out of the user DB -- not by `setKhatmPage` guarding the write, which says
 *  nothing about a row this app did not write. */
export function requestMushafPage(page: number): void {
  pending = page;
}

/** The pending request, consumed. Null when there is none. */
export function takeMushafPage(): number | null {
  const page = pending;
  pending = null;
  return page;
}
