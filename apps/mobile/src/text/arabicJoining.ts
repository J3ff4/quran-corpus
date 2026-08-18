/**
 * Arabic cursive joining across separately-shaped text runs.
 *
 * On the web the browser shapes a word across adjacent inline spans, so the
 * coloured-per-segment word in `SegmentPills` joins correctly with no help.
 * React Native on Android does not: it resolves the inherited font onto every
 * nested `<Text>` and emits metric-affecting spans, which forces Android to
 * shape each segment as its own run. Each run's edge letters then fall back to
 * their isolated or final forms and the word visibly comes apart (owner device
 * report, 2026-08-18).
 *
 * The fix is to make each run shape as though its neighbours were there.
 */

/** Zero-width joiner: asks for the connected form of the letter beside it. */
const ZWJ = '\u200D';

/**
 * Arabic combining marks. Cursive joining is decided by the letters alone and
 * every one of these is transparent to it, so they are skipped when looking for
 * the letter on either side of a boundary.
 */
const MARK =
  /[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u08D3-\u08FF]/;

/** Letters that connect to the letter before them but never to the one after. */
const RIGHT_JOINING = 'آأؤإاةدذرزوٱ';

/** Hamza connects on neither side. */
const NON_JOINING = 'ء';

const ALEF = 'آأإاٱ';
const LAM = 'ل';

/** The first or last actual letter of a segment, ignoring its diacritics. */
function baseLetter(form: string, fromEnd: boolean): string | null {
  const chars = [...form];
  if (fromEnd) chars.reverse();
  return chars.find((char) => !MARK.test(char)) ?? null;
}

/**
 * Whether these two letters, in logical order, would be drawn connected.
 * `left` has to be dual-joining to reach forward at all; `right` only has to be
 * something other than hamza, since right-joining letters still accept a
 * connection from behind.
 */
function connects(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return false;
  if (NON_JOINING.includes(left) || RIGHT_JOINING.includes(left)) return false;
  return !NON_JOINING.includes(right);
}

/**
 * A lam-alef pair is a required ligature and a ligature cannot form across two
 * runs, so ZWJ alone leaves `ٱلْأَرْضِ` drawn as a lam and a separate alef. Hand the
 * lam to the following segment instead: the pair then shapes inside one run,
 * at the cost of that one letter carrying the next segment's colour. 1,279 of
 * the corpus's 41,962 multi-segment words hit this, nearly all of them the
 * determiner `ٱلْ` before a hamza-alef stem.
 */
function shiftLamAlef(forms: string[]): string[] {
  const shifted = [...forms];

  for (let index = 0; index < shifted.length - 1; index += 1) {
    const left = shifted[index]!;
    const right = shifted[index + 1]!;
    if (baseLetter(left, true) !== LAM) continue;
    if (!ALEF.includes(baseLetter(right, false) ?? '')) continue;

    const lamIndex = left.lastIndexOf(LAM);

    if (lamIndex > 0) {
      // The lam and the diacritics after it go to the stem.
      shifted[index] = left.slice(0, lamIndex);
      shifted[index + 1] = left.slice(lamIndex) + right;
      continue;
    }

    // The lam is the whole prefix -- 185 words, `لِأَنفُسِكُمْ` and its like -- so
    // moving it would leave an empty coloured run and drop a segment off the
    // word. Take the alef backwards instead; the ligature lands in the prefix's
    // colour rather than the stem's, which is the same one-letter compromise
    // the other direction makes.
    const afterAlef = [...right].findIndex((char, position) => position > 0 && !MARK.test(char));
    // Nothing but the alef and its marks: moving it empties the stem instead.
    if (afterAlef < 0) continue;

    shifted[index] = left + right.slice(0, afterAlef);
    shifted[index + 1] = right.slice(afterAlef);
  }

  return shifted;
}

/**
 * Rewrite each segment's Arabic into the text that must be handed to its own
 * run for the whole word to still read as one joined word.
 *
 * ZWJ goes on only the boundaries whose letters genuinely connect: adding it
 * where they do not — a lam after an alef, say — would force a connected form
 * the real word does not have.
 */
export function joinSegmentRuns(forms: string[]): string[] {
  const shifted = shiftLamAlef(forms);

  return shifted.map((form, index) => {
    const previous = index > 0 ? shifted[index - 1]! : null;
    const next = index < shifted.length - 1 ? shifted[index + 1]! : null;
    const joinsPrevious =
      previous !== null && connects(baseLetter(previous, true), baseLetter(form, false));
    const joinsNext = next !== null && connects(baseLetter(form, true), baseLetter(next, false));

    return `${joinsPrevious ? ZWJ : ''}${form}${joinsNext ? ZWJ : ''}`;
  });
}
