import { useMemo } from 'react';
import { surahNameGlyph } from '@quran-corpus/config/ornaments/surahName';

import { BrowseList, type BrowseItem } from './BrowseList';
import type { SurahListItem } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';

interface SurahListProps {
  surahs: SurahListItem[];
  uiLocale: UiLocaleCode;
  onOpenSurah: (surah: SurahListItem) => void;
}

/**
 * The surah index, as glass rows.
 *
 * A mapping onto BrowseList rather than its own FlatList: this is the same row
 * as the juz, page and revealed lists, and keeping four copies is how one of
 * them gains a fix the others miss. The props stay as they were -- this screen
 * is not the place to learn about BrowseItem.
 */
export function SurahList({ surahs, uiLocale, onOpenSurah }: SurahListProps) {
  const ayahsSuffix = t(uiLocale, 'surahList.ayahsSuffix');
  const items = useMemo<BrowseItem[]>(
    () =>
      surahs.map((surah) => ({
        key: `surah-${surah.id}`,
        testID: `browse-surah-${surah.id}`,
        leading: String(surah.id),
        title: surah.nameTranslit,
        subtitle: `${surah.nameTranslation} · ${surah.ayahCount} ${ayahsSuffix}`,
        // The calligraphic glyph, not `nameArabic` (ruling S1). This is the
        // one list where the Arabic is a title rather than text to be read,
        // and the plain name is already carried by the translit beside it.
        // The accessibilityLabel below is unchanged and load-bearing: a PUA
        // codepoint announces as nothing at all.
        arabic: surahNameGlyph(surah.id),
        arabicFace: 'surahName' as const,
        accessibilityLabel: `${surah.nameTranslit}, ${surah.ayahCount} ${ayahsSuffix}`,
        onPress: () => onOpenSurah(surah),
      })),
    [surahs, ayahsSuffix, onOpenSurah],
  );

  return <BrowseList items={items} />;
}
