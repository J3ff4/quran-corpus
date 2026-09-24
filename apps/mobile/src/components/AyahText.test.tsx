import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Word } from '@quran-corpus/data/mobile';
import { AyahText } from './AyahText';

vi.mock('@/settings/settingsStore', () => ({
  // Not a provider: the real store pulls expo-sqlite into the jsdom module
  // graph, and every other component test here mocks it the same way. The
  // step only has to be one useArabicSizes recognises.
  useAppSettings: () => ({ arabicScale: 'medium' }),
}));

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');

  return {
    Text: host('span'),
    View: host('div'),
  };
});

function word(position: number, textArabic: string, transliteration: string | null = null): Word {
  return {
    id: 1000 + position,
    ayah_id: 1,
    position,
    text_arabic: textArabic,
    transliteration,
    root: null,
    lemma: null,
    root_buckwalter: null,
    lemma_buckwalter: null,
    pos_tag: 'N',
    morphology_json: null,
    morphology_description: null,
    grammar_arabic: null,
    grammar_note: null,
    audio_url: null,
  };
}

function wordsFrom(texts: readonly string[]): Word[] {
  return texts.map((text, index) => word(index + 1, text));
}

const threeWords = wordsFrom(['أ', 'ب', 'ج']);

// 96:1 -- prefixed with the basmala, which has no word rows at all.
const AL_ALAQ_1 = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ٱقْرَأْ بِٱسْمِ رَبِّكَ ٱلَّذِى خَلَقَ';
const alAlaq1Words = wordsFrom(['ٱقْرَأْ', 'بِٱسْمِ', 'رَبِّكَ', 'ٱلَّذِى', 'خَلَقَ']);

// 2:255 -- five ۚ, two ۖ and one ۗ, none of which exist in the word rows. The
// texts below are the live corpus rows, so the alignment under test is the
// real one, not one arranged to succeed.
const AL_BAQARAH_255 =
  'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ۚ لَا تَأْخُذُهُۥ سِنَةٌۭ وَلَا نَوْمٌۭ ۚ لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ ۗ مَن ذَا ٱلَّذِى يَشْفَعُ عِندَهُۥٓ إِلَّا بِإِذْنِهِۦ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَىْءٍۢ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ ۚ وَسِعَ كُرْسِيُّهُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضَ ۖ وَلَا يَـُٔودُهُۥ حِفْظُهُمَا ۚ وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ';
const baqarah255Words = wordsFrom([
  'ٱللَّهُ', 'لَآ', 'إِلَٰهَ', 'إِلَّا', 'هُوَ', 'ٱلْحَىُّ', 'ٱلْقَيُّومُ', 'لَا', 'تَأْخُذُهُۥ', 'سِنَةٌ',
  'وَلَا', 'نَوْمٌ', 'لَّهُۥ', 'مَا', 'فِى', 'ٱلسَّمَٰوَٰتِ', 'وَمَا', 'فِى', 'ٱلْأَرْضِ', 'مَن',
  'ذَا', 'ٱلَّذِى', 'يَشْفَعُ', 'عِندَهُۥٓ', 'إِلَّا', 'بِإِذْنِهِۦ', 'يَعْلَمُ', 'مَا', 'بَيْنَ', 'أَيْدِيهِمْ',
  'وَمَا', 'خَلْفَهُمْ', 'وَلَا', 'يُحِيطُونَ', 'بِشَىْءٍ', 'مِّنْ', 'عِلْمِهِۦٓ', 'إِلَّا', 'بِمَا', 'شَآءَ',
  'وَسِعَ', 'كُرْسِيُّهُ', 'ٱلسَّمَٰوَٰتِ', 'وَٱلْأَرْضَ', 'وَلَا', 'يَـُٔودُهُۥ', 'حِفْظُهُمَا', 'وَهُوَ', 'ٱلْعَلِىُّ', 'ٱلْعَظِيمُ',
]);

const noop = () => {};

describe('AyahText', () => {
  afterEach(cleanup);

  it('renders the same run before and after the words load', () => {
    // The whole stutter fix. A run that is one flat <Text> until the query
    // lands and N spans afterwards makes Android re-record the card whole,
    // mid-scroll, and on a long ayah that record is 18.7ms (device,
    // 2026-09-23). Structure and text both have to be identical.
    const { container: before } = render(
      <AyahText textUthmani="أ ب ج" getWords={() => []} surahId={2} ayahNumber={2} onWordPress={noop} />,
    );
    const loading = before.innerHTML;
    cleanup();
    const { container: after } = render(
      <AyahText
        textUthmani="أ ب ج"
        getWords={() => threeWords}
        surahId={2}
        ayahNumber={2}
        onWordPress={noop}
      />,
    );

    expect(after.textContent).toBe('أ ب ج');
    expect(screen.getAllByTestId('word-token')).toHaveLength(3);
    // innerHTML, not a token count: a prop the rows add -- a label, a style --
    // changes the recorded node just as surely as a new span would.
    expect(after.innerHTML).toBe(loading);
  });

  it('renders one pressable token per word once they load', () => {
    const { container } = render(
      <AyahText textUthmani="أ ب ج" getWords={() => threeWords} surahId={2} ayahNumber={2} onWordPress={noop} />,
    );

    expect(screen.getAllByTestId('word-token')).toHaveLength(3);
    // The split dropped the whitespace, so the tokens have to put it back --
    // otherwise the ayah renders as one unbroken run of Arabic.
    expect(container.textContent).toBe('أ ب ج');
  });

  it('gives each token exactly one text child', () => {
    // Fabric serialises this run as an attributed string and rebuilds the
    // Spannable from it on the UI thread, inside a scroll frame, every time a
    // card mounts -- and the cost is per FRAGMENT. Every child of a token is
    // one more fragment, so a separator left as its own child doubles them.
    // On the device that difference is the whole stutter: 2:282 costs 0.4ms
    // flat and 16.1ms at one <Text> per word (atrace, 2026-09-23).
    render(
      <AyahText textUthmani="أ ب ج" getWords={() => threeWords} surahId={2} ayahNumber={2} onWordPress={noop} />,
    );

    for (const token of screen.getAllByTestId('word-token')) {
      expect(token.childNodes).toHaveLength(1);
    }
  });

  it('passes the word the token maps to, not the token index', () => {
    // 96:1 is prefixed with a basmala that has no word rows, so token 4 is
    // word 0. Passing the token index here shifts every word's morphology by
    // four for the whole surah.
    const onWordPress = vi.fn();
    render(
      <AyahText
        textUthmani={AL_ALAQ_1}
        getWords={() => alAlaq1Words}
        surahId={96}
        ayahNumber={1}
        onWordPress={onWordPress}
      />,
    );

    fireEvent.click(screen.getAllByTestId('word-token')[0]!);

    expect(onWordPress).toHaveBeenCalledWith(expect.objectContaining({ position: 1 }));
  });

  it('leaves the basmala prefix out of the ayah run', () => {
    // 96:1 is prefixed with the basmala. SurahReader prints it as a banner
    // above the whole card, so keeping it in the run prints it twice -- which
    // is the defect the banner move was made to fix.
    render(
      <AyahText
        textUthmani={AL_ALAQ_1}
        getWords={() => alAlaq1Words}
        surahId={96}
        ayahNumber={1}
        onWordPress={noop}
      />,
    );

    expect(screen.getAllByTestId('word-token')).toHaveLength(5);
    expect(screen.getByTestId('ayah-run').textContent).not.toContain('ٱلرَّحْمَٰنِ');
    expect(screen.getByTestId('ayah-run').textContent).toContain('ٱقْرَأْ');
    // The separator before the first *rendered* token has to key off the
    // preceding token's isBasmala, not just index === 0 -- otherwise the
    // first real word after four dropped basmala tokens gets a leading space.
    expect(screen.getByTestId('ayah-run').textContent?.startsWith(' ')).toBe(false);
  });

  it('leaves it out while the words are still loading, too', () => {
    // The reader starts every ayah with an empty `words`, so this is the first
    // paint of ayah 1 of every surah but 1 and 9. The banner above does not
    // wait for the words, so an unaligned run that keeps the prefix shows the
    // basmala twice until the query lands.
    const { container } = render(
      <AyahText textUthmani={AL_ALAQ_1} getWords={() => []} surahId={96} ayahNumber={1} onWordPress={noop} />,
    );

    expect(container.textContent).not.toContain('ٱلرَّحِيمِ');
    expect(container.textContent).toContain('ٱقْرَأْ');
  });

  it('leaves it out when alignment fails on ayah 1', () => {
    // Same trap as the loading case, permanently: this ayah never gets tap
    // targets, so a prefix left in the fallback never goes away.
    const { container } = render(
      <AyahText
        textUthmani={AL_ALAQ_1}
        getWords={() => threeWords}
        surahId={96}
        ayahNumber={1}
        onWordPress={noop}
      />,
    );

    // The run still draws every token -- it is built from the text, not the
    // rows -- it just has nothing to open.
    expect(screen.getAllByTestId('word-token').length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('ٱلرَّحِيمِ');
    expect(container.textContent).toContain('ٱقْرَأْ');
  });

  it('keeps al-Fatiha ayah 1 whole, basmala and all', () => {
    // 1:1 IS the basmala. Stripping it here empties the ayah.
    const { container } = render(
      <AyahText
        textUthmani="بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ"
        getWords={() => []}
        surahId={1}
        ayahNumber={1}
        onWordPress={noop}
      />,
    );

    expect(container.textContent).toContain('ٱلرَّحِيمِ');
  });

  it('keeps the waqf pause marks visible', () => {
    // The whole reason the reader tokenizes Uthmani text rather than word
    // rows. If this passes with the marks missing, the phase's central
    // decision has been silently reverted.
    const { container } = render(
      <AyahText
        textUthmani={AL_BAQARAH_255}
        getWords={() => baqarah255Words}
        surahId={2}
        ayahNumber={255}
        onWordPress={noop}
      />,
    );

    // Token count first: the unaligned fallback renders the marks too, so
    // without this the assertions below pass just as well when alignment has
    // failed and nothing in the ayah is tappable.
    expect(screen.getAllByTestId('word-token')).toHaveLength(50);
    expect(container.textContent).toContain('ۚ');
    expect(container.textContent).toContain('ۗ');
  });

  it('opens nothing when alignment fails, and still shows the text', () => {
    // Wrong word count for the text. A partial alignment would attach the
    // wrong morphology to real words, so a press has to do nothing at all --
    // but the reading surface still owes the reader the complete ayah.
    const onWordPress = vi.fn();
    const { container } = render(
      <AyahText
        textUthmani="أ ب ج د ه"
        getWords={() => threeWords}
        surahId={2}
        ayahNumber={2}
        onWordPress={onWordPress}
      />,
    );

    fireEvent.click(screen.getAllByTestId('word-token')[0]!);

    expect(onWordPress).not.toHaveBeenCalled();
    expect(container.textContent).toContain('أ ب ج د ه');
  });

  it('opens nothing when the two halves of the split disagree about the basmala', () => {
    // The run decides the basmala positionally (ayah 1, not al-Fatiha or
    // at-Tawba, more than four tokens) while alignAyahTokens decides it by
    // arithmetic against the word count. They agree on all 6,236 ayahs of the
    // shipped corpus, so this is a text no edition has today -- an ayah 1 of
    // five tokens carrying no prefix. Feed it one and they split: the run
    // drops four tokens the alignment keeps, so the one token still drawn
    // indexes onto the FIRST word row and a tap opens a word four positions
    // away with nothing on screen saying so. Fail closed instead, the way
    // alignAyahTokens already does when it cannot reconcile the rows.
    const onWordPress = vi.fn();
    render(
      <AyahText
        textUthmani="أ ب ج د ه"
        getWords={() => wordsFrom(['أ', 'ب', 'ج', 'د', 'ه'])}
        surahId={2}
        ayahNumber={1}
        onWordPress={onWordPress}
      />,
    );

    fireEvent.click(screen.getAllByTestId('word-token')[0]!);
    expect(onWordPress).not.toHaveBeenCalled();
  });

  it('does not colour words by part of speech', () => {
    // D7: colour lives on the WbW screen and the sheet. Colouring every word
    // in the reading flow turns a mushaf into a syntax highlighter, and it
    // removes the reason to open the WbW screen at all. Web's WordToken does
    // not colour either.
    render(
      <AyahText textUthmani="أ ب ج" getWords={() => threeWords} surahId={2} ayahNumber={2} onWordPress={noop} />,
    );

    for (const token of screen.getAllByTestId('word-token')) {
      expect(token.style.color).toBe('');
    }
  });

  it('keeps the ayah as one text run for line breaking', () => {
    // Nested <Text> inside a parent <Text>, not a flexWrap row of Views --
    // the row loses native Arabic line breaking and justified mushaf flow,
    // which is the reading surface's whole point (CLAUDE.md §8).
    const { container } = render(
      <AyahText textUthmani="أ ب ج" getWords={() => threeWords} surahId={2} ayahNumber={2} onWordPress={noop} />,
    );

    expect(container.querySelector('[data-testid="ayah-run"] [data-testid="word-token"]')).toBeTruthy();
  });

  it('opens a word whose rows arrived without a re-render', () => {
    // The rows are fetched into a ref precisely so their arrival renders
    // nothing, so the press handler cannot read a render-time snapshot: the
    // very first tap after a prefetch returns is the one it would miss.
    // A NEW array, as the reader hands back: before the query lands its map
    // has no entry and the accessor returns a shared empty constant, so a
    // snapshot taken in render is a different object from the rows that
    // arrive.
    let rows: Word[] = [];
    const onWordPress = vi.fn();
    render(
      <AyahText
        textUthmani="أ ب ج"
        getWords={() => rows}
        surahId={2}
        ayahNumber={2}
        onWordPress={onWordPress}
      />,
    );

    rows = threeWords;
    fireEvent.click(screen.getAllByTestId('word-token')[1]!);

    expect(onWordPress).toHaveBeenCalledWith(expect.objectContaining({ position: 2 }));
  });

  it('announces each word by its transliteration', () => {
    // The Arabic run is one long grapheme string to TalkBack in an English or
    // Russian UI; without the label it spells the word out letter by letter.
    render(
      <AyahText
        textUthmani="أ ب"
        getWords={() => [word(1, 'أ', 'alif'), word(2, 'ب', 'ba')]}
        surahId={2}
        ayahNumber={2}
        onWordPress={noop}
      />,
    );

    expect(screen.getByLabelText('alif')).toBeTruthy();
  });
});
