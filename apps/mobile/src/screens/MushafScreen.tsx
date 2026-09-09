import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import type { MushafWord, Word } from '@quran-corpus/data/mobile';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';

import { MushafReader } from '@/components/mushaf/MushafReader';
import { WordSheet } from '@/components/WordSheet';
import { getWordsForAyah, type WordSummary } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { openUserDb } from '@/data/userDb';
import { createLatestReadingPositionRecorder } from '@/data/latestReadingPositionRecorder';
import { getBookmarks, getLastReadingPosition, recordReadingPosition } from '@/data/userRepository';
import { useWordSummaryLoader } from '@/data/useWordSummaryLoader';
import { ayahKey } from '@/mushaf/highlights';
import { useMushafIndex } from '@/mushaf/mushafReaderData';
import { releaseChrome, showChrome, toggleChrome } from '@/mushaf/chromeVisibility';
import { useAppSettings } from '@/settings/settingsStore';
import { useThemeColors } from '@/theme/themeContext';

/** Where the mushaf opens with nothing saved. Page 1 is the Fatiha. */
const FIRST_PAGE = 1;

/**
 * The mushaf tab: the printed page, full screen, with no reader around it.
 *
 * It owns what the surah reader used to hand down, because a tab has no route
 * to take it from. That is the whole point of the split (M7d ruling 1): a page
 * is not a surah, and every prop the reader passed -- the surah, its ayah
 * count, its bookmarks -- was a surah-shaped answer to a page-shaped question.
 */
export function MushafScreen() {
  const { uiLocale, contentLanguage } = useAppSettings();
  const theme = useThemeColors();
  const [client, setClient] = useState<MobileDataClient | null>(null);
  // Null until the saved position has been read. The pager takes its opening
  // page at mount and owns it afterwards, so opening on 1 and correcting to
  // 106 a moment later would be a page turn the reader did not ask for.
  const [initialPage, setInitialPage] = useState<number | null>(null);
  const [bookmarkedKeys, setBookmarkedKeys] = useState<ReadonlySet<string>>(new Set());
  const [openWord, setOpenWord] = useState<WordSummary | null>(null);
  // The layout word behind the open sheet. Kept whole rather than as a surah
  // id: the word-detail route is addressed by surah, ayah NUMBER and position,
  // and a page is the one place in the app where none of the three can be
  // inferred from where the user is.
  const [openMushafWord, setOpenMushafWord] = useState<MushafWord | null>(null);
  const index = useMushafIndex(client);
  const loadWordSummary = useWordSummaryLoader(client, null, contentLanguage);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [corpusDb, userDb] = await Promise.all([openCorpusDb(), openUserDb()]);
        const corpus = createExpoSqliteClient(corpusDb as ExpoSqliteLike);
        const user = createExpoSqliteClient(userDb as ExpoSqliteLike);
        const [position, bookmarks] = await Promise.all([
          getLastReadingPosition(user),
          getBookmarks(user),
        ]);
        if (cancelled) return;
        setClient(corpus);
        // Every bookmark, keyed by coordinate. The reader narrows its own to
        // one surah because it only ever shows one; a page can hold two, and
        // the second surah's bookmarks are exactly what a narrowed set drops.
        setBookmarkedKeys(new Set(bookmarks.map((b) => ayahKey(b.surahId, b.ayahNumber))));
        setInitialPage(position?.page ?? FIRST_PAGE);
      } catch (cause) {
        // Logged for logcat, never shown: the pager still renders, and a page
        // that cannot load its rows draws its own paper ground.
        console.error('[mushaf] load failed', { cause });
        if (!cancelled) setInitialPage(FIRST_PAGE);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // The chrome is the tab bar too. Shown on arrival so the tab the user just
  // pressed is still under their thumb, and released on the way out so no
  // other screen inherits a hidden bar or a pending countdown.
  useEffect(() => {
    showChrome();
    return releaseChrome;
  }, []);

  const recorder = useMemo(
    () =>
      createLatestReadingPositionRecorder(
        async (position) => {
          const userDb = await openUserDb();
          const user = createExpoSqliteClient(userDb as ExpoSqliteLike);
          await recordReadingPosition(user, position);
        },
        // Logged, not surfaced. The mushaf has no error strip -- the page is
        // the whole screen (ruling 1) -- and a failed position write costs the
        // reader nothing they can see or act on until the next launch.
        (cause: unknown) => console.error('[mushaf] position write failed', { cause }),
      ),
    [uiLocale],
  );

  const onPageChange = useCallback(
    (page: number) => {
      const entry = index.pages.get(page);
      if (!entry) return;
      // Ruling 13: one position row, shared with the surah reader. The page's
      // opening ayah is the coordinate -- it is the only ayah on the page the
      // index can name without reading the layout rows.
      recorder.record({ surahId: entry.startSurahId, ayahNumber: entry.startAyahNumber, page });
    },
    [index.pages, recorder],
  );

  const requestRef = useRef(0);
  const onWordPress = useCallback(
    (word: MushafWord, ayahId: number) => {
      if (!client) return;
      const request = (requestRef.current += 1);
      void getWordsForAyah(client, ayahId)
        .then(async (words: Word[]) => {
          const row = words.find((candidate) => candidate.position === word.position);
          // No word row behind the glyph is the ayah-end medallion. Nothing
          // opens, as in the reader.
          if (!row) return;
          const summary = await loadWordSummary(row, word.surahId);
          if (requestRef.current !== request) return;
          setOpenMushafWord(word);
          setOpenWord(summary);
        })
        .catch((cause: unknown) => {
          console.error('[mushaf] word summary failed', { ayahId, position: word.position, cause });
        });
    },
    [client, loadWordSummary],
  );

  const closeSheet = useCallback(() => {
    requestRef.current += 1;
    setOpenWord(null);
    setOpenMushafWord(null);
  }, []);

  if (initialPage === null) {
    return (
      <View testID="mushaf-screen" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <View testID="mushaf-screen" style={{ flex: 1 }}>
      <MushafReader
        client={client}
        index={index}
        initialPage={initialPage}
        landingAyah={null}
        bookmarkedKeys={bookmarkedKeys}
        playingAyah={null}
        focusPage={null}
        uiLocale={uiLocale}
        onPageChange={onPageChange}
        onWordPress={onWordPress}
        onTap={toggleChrome}
        onLanded={noop}
      />
      <WordSheet
        summary={openWord}
        uiLocale={uiLocale}
        onClose={closeSheet}
        onOpenDetail={(word: Word) => {
          if (!openMushafWord) return;
          const { surahId, ayahNumber } = openMushafWord;
          closeSheet();
          router.push(`/word/${surahId}/${ayahNumber}/${word.position}`);
        }}
        onOpenRoot={(rootBuckwalter: string) => {
          closeSheet();
          // Buckwalter carries `$`, `<` and `'`, none of which survive a raw
          // path segment.
          router.push(`/root/${encodeURIComponent(rootBuckwalter)}`);
        }}
      />
    </View>
  );
}

function noop() {}
