import { afterEach, describe, expect, it, vi } from 'vitest';
import { localDay, streakFrom, weeklyLog } from './counters';

describe('localDay', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the device local date, not UTC', () => {
    // Decision 22. A user reading at 01:00 in Tashkent (UTC+5) is on the next
    // day locally and the previous one in UTC; toISOString() would break their
    // streak at exactly the hour people read.
    //
    // The zone is pinned because the assertion is meaningless without it: this
    // runner sits at UTC-5, where 01:00 local is 06:00 UTC on the *same* date,
    // so a toISOString() implementation would pass. Pinning makes the case fail
    // for that implementation on any machine.
    vi.stubEnv('TZ', 'Asia/Tashkent');

    const late = new Date(2026, 7, 24, 1, 0, 0); // local 2026-08-24, 2026-08-23 in UTC
    expect(late.toISOString().slice(0, 10)).toBe('2026-08-23');
    expect(localDay(late)).toBe('2026-08-24');
  });

  it('pads a single-digit month and day', () => {
    expect(localDay(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05');
  });
});

describe('streakFrom', () => {
  it('counts consecutive days ending today', () => {
    expect(streakFrom(['2026-08-24', '2026-08-23', '2026-08-22'], '2026-08-24')).toBe(3);
  });

  it('still counts a streak that ended yesterday', () => {
    // Opened at 09:00 having read last night: the streak is alive until the
    // day is missed entirely. Resetting at midnight would show 0 to someone
    // with a 40-day run.
    expect(streakFrom(['2026-08-23', '2026-08-22'], '2026-08-24')).toBe(2);
  });

  it('is zero when the last reading was two days ago', () => {
    expect(streakFrom(['2026-08-22', '2026-08-21'], '2026-08-24')).toBe(0);
  });

  it('stops at the first gap', () => {
    expect(streakFrom(['2026-08-24', '2026-08-22', '2026-08-21'], '2026-08-24')).toBe(1);
  });

  it('crosses a month boundary', () => {
    // Date arithmetic done on the string would give 2026-08-00 here.
    expect(streakFrom(['2026-09-01', '2026-08-31'], '2026-09-01')).toBe(2);
  });

  it('crosses a year boundary', () => {
    expect(streakFrom(['2027-01-01', '2026-12-31', '2026-12-30'], '2027-01-01')).toBe(3);
  });

  it('is zero with no history at all', () => {
    expect(streakFrom([], '2026-08-24')).toBe(0);
  });
});

describe('weeklyLog', () => {
  it('returns seven zero-filled days ending today, oldest first', () => {
    const log = weeklyLog([{ day: '2026-08-24', roots: 3 }, { day: '2026-08-21', roots: 1 }], '2026-08-24');

    expect(log).toHaveLength(7);
    expect(log[0]?.day).toBe('2026-08-18');
    expect(log[6]).toEqual({ day: '2026-08-24', roots: 3 });
    expect(log[3]).toEqual({ day: '2026-08-21', roots: 1 });
    expect(log[1]).toEqual({ day: '2026-08-19', roots: 0 });
  });

  it('drops rows older than the window instead of shifting the chart', () => {
    // getRootViewsByDay takes a cutoff, but nothing stops a caller passing a
    // wider one; the chart is seven bars whatever it is handed.
    const log = weeklyLog(
      [{ day: '2026-06-01', roots: 99 }, { day: '2026-08-20', roots: 2 }],
      '2026-08-24',
    );

    expect(log).toHaveLength(7);
    expect(log.map((entry) => entry.roots)).toEqual([0, 0, 2, 0, 0, 0, 0]);
  });

  it('is all zeroes on a file with no root views', () => {
    const log = weeklyLog([], '2026-08-24');

    expect(log).toHaveLength(7);
    expect(log.every((entry) => entry.roots === 0)).toBe(true);
  });
});
