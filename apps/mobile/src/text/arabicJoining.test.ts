import { describe, expect, it } from 'vitest';
import { joinSegmentRuns } from './arabicJoining';

const ZWJ = '‍';

describe('joinSegmentRuns', () => {
  it('leaves a single segment untouched', () => {
    expect(joinSegmentRuns(['كِتَٰبُ'])).toEqual([
      'كِتَٰبُ',
    ]);
  });

  it('joins a boundary whose letters connect', () => {
    // 2:2 ٱلْكِتَٰبُ -- lam reaches forward to kaf, so both runs need the joiner or
    // the lam is drawn final and the kaf isolated.
    const [prefix, stem] = joinSegmentRuns(['ٱلْ', 'كِتَٰبُ']);

    expect(prefix).toBe(`ٱلْ${ZWJ}`);
    expect(stem).toBe(`${ZWJ}كِتَٰبُ`);
  });

  it('skips the diacritics between the two letters of a boundary', () => {
    // 2:2 لِّلْمُتَّقِينَ -- the shadda and kasra sit after the lam and must not be
    // mistaken for the letter that decides the join.
    const [preposition, determiner] = joinSegmentRuns([
      'لِّ',
      'لْ',
      'مُتَّقِينَ',
    ]);

    expect(preposition).toBe(`لِّ${ZWJ}`);
    expect(determiner).toBe(`${ZWJ}لْ${ZWJ}`);
  });

  it('leaves a boundary alone when the left letter cannot reach forward', () => {
    // Waw is right-joining: it takes a connection from behind and gives none
    // ahead, so the following segment is already drawn correctly on its own.
    expect(joinSegmentRuns(['وَ', 'من'])).toEqual(['وَ', 'من']);
  });

  it('leaves a boundary alone when the right letter is hamza', () => {
    expect(joinSegmentRuns(['بِ', 'ء'])).toEqual(['بِ', 'ء']);
  });

  it('hands a boundary lam to the next segment so the lam-alef ligature can form', () => {
    // ٱلْأَرْضِ -- a ligature cannot form across two runs, so the lam moves rather
    // than being joined to an alef it would be drawn separately from.
    const [determiner, stem] = joinSegmentRuns(['ٱلْ', 'أَرْضِ']);

    expect(determiner).toBe('ٱ');
    expect(stem).toBe('لْأَرْضِ');
  });

  it('adds no joiner around a shifted lam, since alef never reaches forward', () => {
    const [determiner, stem] = joinSegmentRuns(['ٱلْ', 'الْ']);

    expect(determiner).not.toContain(ZWJ);
    expect(stem).not.toContain(ZWJ);
  });

  it('takes the alef backwards when the lam is the whole prefix', () => {
    // لِأَنفُسِكُمْ -- moving this lam forward would empty its run and drop a
    // segment's colour off the word, so the ligature forms in the prefix.
    const [preposition, stem] = joinSegmentRuns(['لِ', 'أَنفُسِ']);

    expect(preposition).toBe('لِأَ');
    expect(stem).toBe('نفُسِ');
  });

  it('leaves the ligature broken rather than emptying either run', () => {
    // Nothing but an alef and its marks on the right, and a bare lam on the
    // left: whichever way the pair moved, a run would come out empty.
    expect(joinSegmentRuns(['لِ', 'أَ'])).toEqual([
      `لِ${ZWJ}`,
      `${ZWJ}أَ`,
    ]);
  });

  it('preserves every letter of the word across the rewrite', () => {
    const forms = ['بِ', 'ٱلْ', 'غَيْبِ'];

    expect(joinSegmentRuns(forms).join('').split(ZWJ).join('')).toBe(forms.join(''));
  });
});
