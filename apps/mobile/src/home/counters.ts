export type DailyRoots = { day: string; roots: number };

/** The device's local calendar day as YYYY-MM-DD.
 *
 *  Built from the local getters rather than toISOString(), which converts to
 *  UTC first: at UTC+5 that puts everything before 05:00 on the previous day,
 *  which is both the wrong day and a broken streak (decision 22). */
export function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Midday UTC for a day string. Arithmetic below is pure UTC, so the hour is
 *  only insurance against a later change to local parsing, where stepping a
 *  day from midnight across a DST shift can land back on the same date. */
function dayValue(day: string): number {
  return Date.parse(`${day}T12:00:00Z`);
}

function shiftDay(day: string, delta: number): string {
  const shifted = new Date(dayValue(day) + delta * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

/** Days the weekly log covers. Exported because the screen queries the same
 *  window it renders: two independent 7s would let the fetched range and the
 *  drawn range drift apart silently. */
export const WEEK_DAYS = 7;

/** Seven days ending today, oldest first, zero-filled. Fixed length so the
 *  bar chart does not change width as history accumulates, and keyed by day so
 *  rows outside the window are dropped rather than shifting the bars along. */
export function weeklyLog(rows: readonly DailyRoots[], today: string): DailyRoots[] {
  const byDay = new Map(rows.map((row) => [row.day, row.roots]));
  return Array.from({ length: WEEK_DAYS }, (_, index) => {
    const day = shiftDay(today, index - (WEEK_DAYS - 1));
    return { day, roots: byDay.get(day) ?? 0 };
  });
}
