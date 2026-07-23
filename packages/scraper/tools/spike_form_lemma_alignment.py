"""One-off spike: does word_segments.lemma = root_forms.form_arabic hold
across every root, the way it did for the two roots (gfr, rHm) checked by
hand during design? Diagnostic only -- not imported by app code.

Run: python3 packages/scraper/tools/spike_form_lemma_alignment.py
"""
import sqlite3

DB_PATH = "/home/claude/quran-data/quran.db"


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    cur = con.cursor()

    cur.execute("SELECT id, root_buckwalter FROM roots")
    roots = cur.fetchall()

    total_roots = 0
    mismatched_roots = 0
    total_occurrences = 0
    unmatched_occurrences = 0
    mismatch_examples: list[tuple[str, int, int]] = []

    for root_id, bw in roots:
        cur.execute(
            "SELECT COUNT(*) FROM (SELECT DISTINCT word_id FROM word_segments WHERE root = ?)",
            (bw,),
        )
        occ = cur.fetchone()[0]
        if occ == 0:
            continue
        total_roots += 1
        total_occurrences += occ

        # One row per word (MIN(segment_index) tie-break for the rare
        # double-stem-same-root case), joined to root_forms by exact lemma text.
        cur.execute(
            """
            SELECT COUNT(*) FROM (
              SELECT m.word_id
              FROM (SELECT word_id, MIN(segment_index) AS seg_idx
                    FROM word_segments WHERE root = ? GROUP BY word_id) m
              JOIN word_segments ws
                ON ws.word_id = m.word_id AND ws.segment_index = m.seg_idx
              LEFT JOIN root_forms rf
                ON rf.root_id = ? AND rf.form_arabic = ws.lemma
              WHERE rf.id IS NULL
            )
            """,
            (bw, root_id),
        )
        unmatched = cur.fetchone()[0]
        if unmatched > 0:
            mismatched_roots += 1
            unmatched_occurrences += unmatched
            if len(mismatch_examples) < 20:
                mismatch_examples.append((bw, occ, unmatched))

    print(f"Roots with occurrences: {total_roots}")
    print(f"Roots with >=1 unmatched occurrence: {mismatched_roots}")
    print(f"Total occurrences checked: {total_occurrences}")
    print(f"Total unmatched occurrences: {unmatched_occurrences}")
    print(f"Unmatched rate: {unmatched_occurrences / total_occurrences:.4%}")
    print("\nFirst 20 roots with a mismatch (root_buckwalter, occ, unmatched):")
    for bw, occ, unmatched in mismatch_examples:
        print(f"  {bw}: {occ} occurrences, {unmatched} unmatched")


if __name__ == "__main__":
    main()
