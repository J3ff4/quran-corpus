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

/**
 * Consecutive reading days ending today or yesterday.
 *
 * Yesterday counts (decision 22 is "any reading", and a streak that resets at
 * midnight tells a 40-day reader they have 0 the moment they open the app).
 * Anything older is a broken streak.
 */
export function streakFrom(days: readonly string[], today: string): number {
  const seen = new Set(days);
  let cursor = seen.has(today) ? today : shiftDay(today, -1);
  if (!seen.has(cursor)) return 0;

  let streak = 0;
  while (seen.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

/** Seven days ending today, oldest first, zero-filled. Fixed length so the
 *  bar chart does not change width as history accumulates, and keyed by day so
 *  rows outside the window are dropped rather than shifting the bars along. */
export function weeklyLog(rows: readonly DailyRoots[], today: string): DailyRoots[] {
  const byDay = new Map(rows.map((row) => [row.day, row.roots]));
  return Array.from({ length: 7 }, (_, index) => {
    const day = shiftDay(today, index - 6);
    return { day, roots: byDay.get(day) ?? 0 };
  });
}
