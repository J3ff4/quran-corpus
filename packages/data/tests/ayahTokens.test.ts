import { describe, expect, it } from 'vitest';
import { alignAyahTokens } from '../src/text/ayahTokens.js';

// 1:1 in the DB is prefixed with a byte-order mark. Written as an escape, not
// pasted: an editor or a reformat that silently drops the invisible U+FEFF
// would turn the first test green without the implementation stripping
// anything.
const AL_FATIHA_1 = '\uFEFFبِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
// 2:44 opens with the rub-el-hizb marker and carries one waqf mark mid-ayah.
const AL_BAQARAH_44 =
  '۞ أَتَأْمُرُونَ ٱلنَّاسَ بِٱلْبِرِّ وَتَنسَوْنَ أَنفُسَكُمْ وَأَنتُمْ تَتْلُونَ ٱلْكِتَٰبَ ۚ أَفَلَا تَعْقِلُونَ';
// 9:1 is the one ayah 1 in the corpus with no basmala prefix at all.
const AT_TAWBA_1 =
  'بَرَآءَةٌۭ مِّنَ ٱللَّهِ وَرَسُولِهِۦٓ إِلَى ٱلَّذِينَ عَٰهَدتُّم مِّنَ ٱلْمُشْرِكِينَ';
// 6:1 carries a basmala AND a mid-ayah waqf mark -- both at once.
const AL_ANAM_1 =
  'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ٱلْحَمْدُ لِلَّهِ ٱلَّذِى خَلَقَ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضَ وَجَعَلَ ٱلظُّلُمَٰتِ وَٱلنُّورَ ۖ ثُمَّ ٱلَّذِينَ كَفَرُوا۟ بِرَبِّهِمْ يَعْدِلُونَ';
// 96:1 is prefixed with the basmala, which has no rows in `words`.
const AL_ALAQ_1 =
  'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ٱقْرَأْ بِٱسْمِ رَبِّكَ ٱلَّذِى خَلَقَ';

/** N single-token word rows. The text only matters where a row spans two
 *  tokens, which is 37:130 and nothing else -- see the joined-word test. */
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`);

describe('alignAyahTokens', () => {
  it('lets one word row claim two tokens when the row itself has a space', () => {
    // 37:130 is the only word row in the corpus containing a space: the name
    // إِلْ يَاسِينَ is one word to the morphology and two whitespace-separated
    // tokens in text_uthmani. Counting rows instead of tokens makes this the
    // single alignment failure in the whole Quran, and the ayah silently
    // loses word tapping.
    const tokens = alignAyahTokens(
      'سَلَٰمٌ عَلَىٰٓ إِلْ يَاسِينَ',
      ['سَلَٰمٌ', 'عَلَىٰٓ', 'إِلْ يَاسِينَ'],
      { surahId: 37, ayahNumber: 130 },
    );
    expect(tokens).not.toBeNull();
    expect(tokens!).toHaveLength(4);
    // Both halves of the name resolve to the same word, so tapping either one
    // opens the same morphology.
    expect(tokens!.map((token) => token.wordIndex)).toEqual([0, 1, 2, 2]);
  });

  it('strips the byte-order mark rather than emitting it as a token', () => {
    const tokens = alignAyahTokens(AL_FATIHA_1, words(4), { surahId: 1, ayahNumber: 1 });
    expect(tokens).not.toBeNull();
    expect(tokens!).toHaveLength(4);
    // A leaked U+FEFF renders as an invisible glyph that still takes a tap
    // target and shifts every wordIndex by one.
    expect(tokens![0]!.text.startsWith('\uFEFF')).toBe(false);
    expect(tokens![0]!.wordIndex).toBe(0);
  });

  it('keeps a mid-ayah pause mark attached to the word it follows', () => {
    const tokens = alignAyahTokens(AL_BAQARAH_44, words(10), { surahId: 2, ayahNumber: 44 });
    expect(tokens).not.toBeNull();
    // 11 tokens: the leading ۞ plus 10 words. The waqf ۚ is merged into
    // ٱلْكِتَٰبَ rather than standing alone -- standing alone it would be an
    // 11th word token and every index after it would be wrong.
    expect(tokens!).toHaveLength(11);
    expect(tokens![0]!.wordIndex).toBeNull();
    expect(tokens![0]!.text).toBe('۞');
    const kitab = tokens!.find((token) => token.text.includes('ٱلْكِتَٰبَ'));
    expect(kitab!.text).toContain('ۚ');
    expect(kitab!.wordIndex).toBe(7);
    // And the ayah's last word still maps to the last word row.
    expect(tokens![tokens!.length - 1]!.wordIndex).toBe(9);
  });

  it('leaves a prefixed basmala unindexed instead of consuming four words', () => {
    const tokens = alignAyahTokens(AL_ALAQ_1, words(5), { surahId: 96, ayahNumber: 1 });
    expect(tokens).not.toBeNull();
    expect(tokens!).toHaveLength(9);
    expect(tokens!.slice(0, 4).every((token) => token.wordIndex === null)).toBe(true);
    // ٱقْرَأْ is the first real word of the surah, so it must be word 0 -- not
    // word 4, which would offset the whole surah's morphology by four.
    expect(tokens![4]!.text).toBe('ٱقْرَأْ');
    expect(tokens![4]!.wordIndex).toBe(0);
  });

  it('detects the basmala on an ayah 1 that also carries a waqf mark', () => {
    // 6:1 -- 19 raw tokens = 4 basmala + 14 words + 1 waqf. This is the case
    // the merge-then-check ordering exists for: checked against the RAW count
    // the basmala is missed (19 !== 14 + 4), the whole ayah fails alignment
    // and the reader silently drops to the unaligned blob. 31 ayahs are in
    // this shape, which is the 6205/6236 = 99.50% the wrong order scores.
    const tokens = alignAyahTokens(AL_ANAM_1, words(14), { surahId: 6, ayahNumber: 1 });
    expect(tokens).not.toBeNull();
    expect(tokens!).toHaveLength(18);
    expect(tokens!.slice(0, 4).every((token) => token.wordIndex === null)).toBe(true);
    expect(tokens![4]!.text).toBe('ٱلْحَمْدُ');
    expect(tokens![4]!.wordIndex).toBe(0);
    expect(tokens![tokens!.length - 1]!.wordIndex).toBe(13);
  });

  it('does not strip four words from an ayah that merely has four extra tokens', () => {
    // Only ayah 1 of a surah carries a basmala. Applying the rule anywhere
    // else eats four real words; 2:26 is one of the ayahs where the counts
    // would otherwise coincide.
    const tokens = alignAyahTokens('أ ب ج د ه و ز ح', words(4), { surahId: 2, ayahNumber: 26 });
    expect(tokens).toBeNull();
  });

  it('indexes every word of the two ayahs that carry no prefixed basmala', () => {
    // 1:1 IS the basmala -- its four tokens are four real words. 9:1 has no
    // basmala at all. Real text, real word counts, from the bundled DB.
    for (const [text, count, surahId] of [
      [AL_FATIHA_1, 4, 1],
      [AT_TAWBA_1, 9, 9],
    ] as const) {
      const tokens = alignAyahTokens(text, words(count), { surahId, ayahNumber: 1 });
      expect(tokens).not.toBeNull();
      expect(tokens!.every((token) => token.wordIndex !== null)).toBe(true);
    }
  });

  it('never applies the basmala rule to surah 1 or 9, even on a count tie', () => {
    // Neither real ayah currently hits `merged.length === wordCount + 4`, so
    // the exemption is unreachable through the live DB -- these synthetic
    // inputs are what make it testable. They are the shape a re-import or a
    // word-row correction could produce, and in that shape the rule would
    // blank the first four words of the opening surah. Assert the exemption
    // directly rather than trusting the current row counts to keep protecting
    // it.
    const eightTokens = 'أ ب ج د ه و ز ح';
    for (const surahId of [1, 9]) {
      const tokens = alignAyahTokens(eightTokens, words(4), { surahId, ayahNumber: 1 });
      // Not eight-minus-a-basmala: the counts genuinely disagree, so this
      // fails closed rather than silently discarding four words.
      expect(tokens).toBeNull();
    }
    // The same input for any other surah IS a basmala prefix.
    const other = alignAyahTokens(eightTokens, words(4), { surahId: 6, ayahNumber: 1 });
    expect(other).not.toBeNull();
    expect(other!.slice(0, 4).every((token) => token.wordIndex === null)).toBe(true);
  });

  it('returns null when the counts cannot be reconciled', () => {
    // The caller renders the raw Uthmani string in this case. Returning a
    // partial alignment instead would attach the wrong morphology to a word,
    // which is worse than showing no morphology.
    expect(alignAyahTokens('أ ب ج', words(7), { surahId: 2, ayahNumber: 2 })).toBeNull();
  });

  it('handles an ayah that is nothing but a mark', () => {
    expect(alignAyahTokens('۞', [], { surahId: 2, ayahNumber: 44 })).toEqual([
      { text: '۞', wordIndex: null },
    ]);
  });
});
