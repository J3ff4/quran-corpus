#!/usr/bin/env python3
"""Fit a row-height model to measured reader rows.

Input: a logcat dump containing RHSPIKE lines emitted by the spike wrapper in
SurahReader's renderItem:

    RHSPIKE <mode> <arabicSize> <surah>:<ayah> <heightDp> w<widthDp>

What matters for getItemLayout is not per-row error but *cumulative* error:
scrollToIndex sums every preceding row, so a small per-row bias lands the
target hundreds of dp off deep in a surah. Both are reported.

Usage: fit-row-heights.py dump.txt [--db /path/to/quran.db]
"""
import argparse
import math
import re
import sqlite3
import statistics
from collections import defaultdict

LINE = re.compile(r"RHSPIKE (\w+) (\d+) (\d+):(\d+) (\d+) w(\d+)")


def load(path):
    rows = []
    seen = set()
    for line in open(path, errors="replace"):
        m = LINE.search(line)
        if not m:
            continue
        mode, size, surah, ayah, h, w = m.groups()
        key = (mode, int(size), int(surah), int(ayah), int(w))
        # A row re-measures on every layout pass; the last value is the settled
        # one, so later lines overwrite earlier ones for the same key.
        if key in seen:
            rows = [r for r in rows if r[0] != key]
        seen.add(key)
        rows.append((key, int(h)))
    return rows


def char_counts(db, keys):
    con = sqlite3.connect(db)
    out = {}
    for surah, ayah in keys:
        r = con.execute(
            "select length(text_uthmani), (select length(text) from translations t"
            "  where t.ayah_id = a.id and t.language_code='en' limit 1)"
            " from ayahs a where surah_id=? and ayah_number=?",
            (surah, ayah),
        ).fetchone()
        if r:
            out[(surah, ayah)] = (r[0] or 0, r[1] or 0)
    return out


def fit_lines(samples, cpl):
    """Least squares for H = a + b * ceil(chars / cpl)."""
    xs = [math.ceil(c / cpl) for c, _ in samples]
    ys = [h for _, h in samples]
    n = len(xs)
    mx, my = sum(xs) / n, sum(ys) / n
    denom = sum((x - mx) ** 2 for x in xs)
    if denom == 0:
        return my, 0.0
    b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / denom
    return my - b * mx, b


def report(label, samples):
    """samples: [(chars, height)]"""
    if len(samples) < 4:
        print(f"  {label}: only {len(samples)} rows, skipped")
        return
    best = None
    for cpl in range(10, 121):
        a, b = fit_lines(samples, cpl)
        err = [a + b * math.ceil(c / cpl) - h for c, h in samples]
        rms = math.sqrt(sum(e * e for e in err) / len(err))
        if best is None or rms < best[0]:
            best = (rms, cpl, a, b, err)
    rms, cpl, a, b, err = best
    absmax = max(abs(e) for e in err)
    p95 = sorted(abs(e) for e in err)[int(len(err) * 0.95) - 1]
    # Cumulative drift: the offset error scrollToIndex would carry at index k.
    cum = 0.0
    worst_cum = 0.0
    for e in err:
        cum += e
        worst_cum = max(worst_cum, abs(cum))
    print(f"  {label}: n={len(samples)}")
    print(f"    H = {a:.1f} + {b:.1f} * ceil(chars / {cpl})")
    print(f"    per-row  rms={rms:.1f}dp  p95={p95:.1f}dp  max={absmax:.1f}dp")
    print(f"    cumulative drift over the sample: {cum:+.0f}dp (worst |prefix| {worst_cum:.0f}dp)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dump")
    ap.add_argument("--db", default="/home/claude/quran-data/quran.db")
    args = ap.parse_args()

    rows = load(args.dump)
    if not rows:
        raise SystemExit("no RHSPIKE lines found")
    chars = char_counts(args.db, {(k[2], k[3]) for k, _ in rows})

    groups = defaultdict(list)
    for (mode, size, surah, ayah, width), h in rows:
        ar, en = chars.get((surah, ayah), (0, 0))
        # Mushaf draws Arabic only; the translation card draws both, so its
        # driver is the sum.
        driver = ar if mode == "mushaf" else ar + en
        groups[(mode, size, width)].append((driver, h))

    print(f"{len(rows)} measured rows, {len(groups)} (mode, size, width) groups\n")
    for key in sorted(groups):
        mode, size, width = key
        hs = [h for _, h in groups[key]]
        print(f"{mode} size={size} width={width}dp  heights {min(hs)}..{max(hs)}dp "
              f"median {statistics.median(hs):.0f}")
        report("line model", groups[key])
        print()


if __name__ == "__main__":
    main()
