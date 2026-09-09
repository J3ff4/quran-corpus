import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import type { MushafWord, Word } from '@quran-corpus/data/mobile';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';

import { AyahControls } from '@/components/AyahControls';
import { NoteEditor } from '@/components/NoteEditor';
import { MushafChrome } from '@/components/mushaf/MushafChrome';
import { MushafReader } from '@/components/mushaf/MushafReader';
import { PageJumpSheet, type JumpKind } from '@/components/mushaf/PageJumpSheet';
import { WordSheet } from '@/components/WordSheet';
import { getWordsForAyah, type WordSummary } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { openUserDb } from '@/data/userDb';
import { createLatestReadingPositionRecorder } from '@/data/latestReadingPositionRecorder';
import {
  getBookmarks,
  getLastReadingPosition,
  recordReadingPosition,
  setBookmark,
  setBookmarkNote,
} from '@/data/userRepository';
import { useWordSummaryLoader } from '@/data/useWordSummaryLoader';
import { useRecitation } from '@/audio/ayahAudio';
import { t } from '@/i18n/uiStrings';
import { ayahKey, type PressedWord } from '@/mushaf/highlights';
import { useMushafIndex } from '@/mushaf/mushafReaderData';
import { pageForJump } from '@/mushaf/pageJump';
import {
  releaseChrome,
  showChrome,
  toggleChrome,
  useChromeVisible,
} from '@/mushaf/chromeVisibility';
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
  const { uiLocale, contentLanguage, reciterId, continuousPlay } = useAppSettings();
  const theme = useThemeColors();
  const [client, setClient] = useState<MobileDataClient | null>(null);
  // Null until the saved position has been read. The pager takes its opening
  // page at mount and owns it afterwards, so opening on 1 and correcting to
  // 106 a moment later would be a page turn the reader did not ask for.
  const [initialPage, setInitialPage] = useState<number | null>(null);
  // `surah:ayah` -> its note. One map, not a Set plus a second map: both would
  // be written from the same rows and could disagree. Keyed by coordinate and
  // not by ayah number, because a page holds whatever surahs print put on it --
  // this is the whole of issue #61.
  const [bookmarks, setBookmarks] = useState<ReadonlyMap<string, string | null>>(new Map());
  const [editingNote, setEditingNote] = useState<PressedWord | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  /** The ayah being recited, with its own surah. Null while nothing plays. */
  const [playing, setPlaying] = useState<{ surahId: number; ayahNumber: number } | null>(null);
  const [openWord, setOpenWord] = useState<WordSummary | null>(null);
  // The layout word behind the open sheet. Kept whole rather than as a surah
  // id: the word-detail route is addressed by surah, ayah NUMBER and position,
  // and a page is the one place in the app where none of the three can be
  // inferred from where the user is.
  const [openMushafWord, setOpenMushafWord] = useState<MushafWord | null>(null);
  const bookmarkedKeys = useMemo(() => new Set(bookmarks.keys()), [bookmarks]);
  const index = useMushafIndex(client);
  const chromeVisible = useChromeVisible();
  const [jumpOpen, setJumpOpen] = useState(false);
  /** A page the reader has to be taken to without swiping there. */
  const [focusPage, setFocusPage] = useState<number | null>(null);
  const loadWordSummary = useWordSummaryLoader(client, null, contentLanguage);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [corpusDb, userDb] = await Promise.all([openCorpusDb(), openUserDb()]);
        const corpus = createExpoSqliteClient(corpusDb as ExpoSqliteLike);
        const user = createExpoSqliteClient(userDb as ExpoSqliteLike);
        const [position, saved] = await Promise.all([
          getLastReadingPosition(user),
          getBookmarks(user),
        ]);
        if (cancelled) return;
        setClient(corpus);
        // Every bookmark, keyed by coordinate. The reader narrows its own to
        // one surah because it only ever shows one; a page can hold two, and
        // the second surah's bookmarks are exactly what a narrowed set drops.
        setBookmarks(
          new Map(saved.map((bookmark) => [ayahKey(bookmark.surahId, bookmark.ayahNumber), bookmark.note])),
        );
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

  // The surah being recited, not the screen's -- a tab has none. `useRecitation`
  // reads `surah` when it starts an ayah rather than at mount, so moving it
  // between ayahs is safe; continuous play still advances WITHIN a surah only,
  // and stops at its last ayah exactly as the reader's does.
  const audio = useRecitation(playing?.surahId ?? null, (playing ? (index.ayahCounts.get(playing.surahId) ?? 0) : 0), reciterId, {
    continuous: continuousPlay,
    ...(playing ? { surahName: index.surahNames.get(playing.surahId) ?? '' } : {}),
  });

  // The hook owns which ayah is sounding; this screen owns which surah that
  // ayah belongs to, so the two are reconciled here rather than duplicated.
  useEffect(() => {
    setPlaying((current) => {
      if (audio.ayah === null) return null;
      if (current === null) return null;
      return current.ayahNumber === audio.ayah
        ? current
        : { surahId: current.surahId, ayahNumber: audio.ayah };
    });
  }, [audio.ayah]);

  const toggleBookmark = useCallback(
    async (target: { surahId: number; ayahNumber: number }) => {
      const key = ayahKey(target.surahId, target.ayahNumber);
      const next = !bookmarks.has(key);
      const previousNote = bookmarks.get(key) ?? null;
      setBookmarks((current) => {
        const updated = new Map(current);
        if (next) updated.set(key, null);
        else updated.delete(key);
        return updated;
      });

      try {
        const userDb = await openUserDb();
        const user = createExpoSqliteClient(userDb as ExpoSqliteLike);
        await setBookmark(user, target.surahId, target.ayahNumber, next);
      } catch (cause) {
        console.error('[mushaf] bookmark write failed', { ...target, cause });
        // This ayah only, off the current map: restoring a snapshot would also
        // revert a toggle that landed while this write was in flight.
        setBookmarks((current) => {
          const updated = new Map(current);
          if (next) updated.delete(key);
          else updated.set(key, previousNote);
          return updated;
        });
      }
    },
    [bookmarks],
  );

  const saveNote = useCallback(
    async (target: PressedWord, note: string) => {
      try {
        setNoteError(null);
        const userDb = await openUserDb();
        const user = createExpoSqliteClient(userDb as ExpoSqliteLike);
        await setBookmarkNote(user, target.surahId, target.ayahNumber, note);
        // Read back rather than assume: normalizeNote trims, caps and strips,
        // so the stored note is not always the typed one and the pen's
        // filled/empty state has to follow the row.
        const saved = await getBookmarks(user);
        const stored = saved.find(
          (bookmark) =>
            bookmark.surahId === target.surahId && bookmark.ayahNumber === target.ayahNumber,
        );
        const key = ayahKey(target.surahId, target.ayahNumber);
        setBookmarks((current) => {
          if (!current.has(key)) return current;
          const updated = new Map(current);
          updated.set(key, stored?.note ?? null);
          return updated;
        });
        setEditingNote(null);
      } catch (cause) {
        console.error('[mushaf] note write failed', { ...target, cause });
        setNoteError(t(uiLocale, 'bookmarks.noteFailed'));
      }
    },
    [uiLocale],
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

  const onJump = useCallback(
    (kind: JumpKind, value: number) => {
      setJumpOpen(false);
      const page = pageForJump(index.pages, kind, value);
      // Null only if the index cannot name the target -- the sheet has already
      // refused anything outside the mushaf's own ranges. Nothing moves.
      if (page !== null) setFocusPage(page);
    },
    [index.pages],
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
        playingAyah={playing}
        focusPage={focusPage}
        uiLocale={uiLocale}
        onPageChange={(page) => {
          // Cleared once the pager has arrived, or the next jump to the same
          // page would be a prop that never changes and so never moves it.
          setFocusPage(null);
          onPageChange(page);
        }}
        onWordPress={onWordPress}
        onTap={toggleChrome}
        onLanded={noop}
      />
      <MushafChrome
        visible={chromeVisible}
        uiLocale={uiLocale}
        onOpenJump={() => setJumpOpen(true)}
        onOpenSearch={() => router.push('/search')}
      />
      {jumpOpen ? (
        <PageJumpSheet uiLocale={uiLocale} onClose={() => setJumpOpen(false)} onJump={onJump} />
      ) : null}
      {editingNote ? (
        <NoteEditor
          surahId={editingNote.surahId}
          ayahNumber={editingNote.ayahNumber}
          surahName={index.surahNames.get(editingNote.surahId) ?? null}
          note={bookmarks.get(ayahKey(editingNote.surahId, editingNote.ayahNumber)) ?? null}
          uiLocale={uiLocale}
          error={noteError}
          onCancel={() => {
            setNoteError(null);
            setEditingNote(null);
          }}
          onSave={(note) => void saveNote(editingNote, note)}
        />
      ) : null}
      <WordSheet
        summary={openWord}
        uiLocale={uiLocale}
        {...(openMushafWord === null
          ? {}
          : {
              ayahLabel: `${index.surahNames.get(openMushafWord.surahId) ?? ''} ${
                openMushafWord.surahId
              }:${openMushafWord.ayahNumber}`,
              // Built here rather than described to the sheet: the sheet has no
              // business knowing what a bookmark is. Every control is keyed to
              // the WORD's own surah -- ruling 5, and the half of #61 a tab
              // cannot avoid, since it has no route surah to fall back on.
              ayahActions: (
                <AyahControls
                  surahId={openMushafWord.surahId}
                  ayahNumber={openMushafWord.ayahNumber}
                  bookmarked={bookmarks.has(
                    ayahKey(openMushafWord.surahId, openMushafWord.ayahNumber),
                  )}
                  note={
                    bookmarks.get(ayahKey(openMushafWord.surahId, openMushafWord.ayahNumber)) ?? null
                  }
                  playing={
                    playing?.surahId === openMushafWord.surahId &&
                    playing.ayahNumber === openMushafWord.ayahNumber
                  }
                  uiLocale={uiLocale}
                  onToggleBookmark={() => void toggleBookmark(openMushafWord)}
                  onEditNote={() => {
                    // The word sheet closes first: it is a Modal, and a second
                    // one opened over it lands in a window the first still
                    // holds the reading order of.
                    closeSheet();
                    setEditingNote(openMushafWord);
                  }}
                  onToggleAudio={() => {
                    setPlaying({
                      surahId: openMushafWord.surahId,
                      ayahNumber: openMushafWord.ayahNumber,
                    });
                    audio.toggleAyah(openMushafWord.ayahNumber);
                  }}
                />
              ),
            })}
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
