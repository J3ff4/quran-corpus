const START_DELAY_MS = 90;
const PER_CHAR_MS = 12;
/**
 * Per-character wobble. A fixed cycle rather than Math.random(): the delays are
 * baked into the server HTML, so they must be identical on both sides.
 */
const JITTER_MS = [0, 5, 2, 7, 3];

/** Cumulative start offset for each character. */
function schedule(count: number): number[] {
  const out: number[] = [];
  let at = START_DELAY_MS;
  for (let i = 0; i < count; i += 1) {
    out.push(at);
    at += PER_CHAR_MS + JITTER_MS[i % JITTER_MS.length]!;
  }
  return out;
}

/**
 * Reveals `text` one character at a time, once — for empty states, where a
 * paragraph that types itself in reads as the page thinking rather than as
 * nothing being there.
 *
 * Deliberately CSS-only: every character is a span carrying its own
 * `animation-delay`, and `.typing-char` in globals.css fades it in. No state,
 * no timer, no effect, and nothing that waits on hydration — the reveal starts
 * at first paint and finishes even if the JS bundle never arrives. An earlier
 * JS-driven version seeded the count at 0, which left the whole message
 * invisible in the server HTML until hydration caught up; on a slow phone that
 * is a blank empty state, which is worse than no animation at all.
 *
 * Two details carry the feel:
 *
 * - The per-character delay wobbles. A flat interval reads mechanical.
 * - Characters fade rather than pop, and the fades overlap, so the leading
 *   edge is soft instead of a hard cursor.
 *
 * The cadence runs straight through punctuation — an earlier version held a
 * beat on `.` and `,`, which read as a stall rather than as phrasing.
 *
 * The untyped tail is transparent, not absent, so the paragraph never reflows
 * or re-wraps mid-animation — and the complete string is in the DOM in reading
 * order at every frame, so assistive tech, find-in-page and copy/paste get the
 * whole sentence without an `aria-hidden` duplicate to keep in sync.
 *
 * `prefers-reduced-motion` is honoured in the stylesheet, so it too holds on
 * the very first paint rather than after hydration.
 */
export function TypingText({ text, className }: { text: string; className?: string }) {
  const chars = [...text];
  const delays = schedule(chars.length);
  return (
    <p className={className}>
      {chars.map((ch, i) => (
        <span key={i} className="typing-char" style={{ animationDelay: `${delays[i]}ms` }}>
          {ch}
        </span>
      ))}
    </p>
  );
}
