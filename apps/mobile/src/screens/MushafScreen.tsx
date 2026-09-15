import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import type { MushafLine, MushafWord, Word } from '@quran-corpus/data/mobile';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';

import { AyahControls } from '@/components/AyahControls';
import { NoteEditor } from '@/components/NoteEditor';
import { ReciterSheet } from '@/components/ReciterSheet';
import { useTabBarTop } from '@/components/GlassTabBar';
import { MushafPlayer } from '@/components/mushaf/MushafPlayer';
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
import { useUserDbOnFocus } from '@/data/useUserDbOnFocus';
import { useWordSummaryLoader } from '@/data/useWordSummaryLoader';
import { useRecitationController } from '@/audio/recitationContext';
import { MUSHAF_PAGE_MAX, reciterById } from '@quran-corpus/data/mobile';
import { t } from '@/i18n/uiStrings';
import { ayahKey, type PressedWord } from '@/mushaf/highlights';
import { useMushafIndex } from '@/mushaf/mushafReaderData';
import { useMushafPage } from '@/mushaf/useMushafPage';
import { ayahOnPage, firstAyahOnPage, nextAyahOnPage } from '@/mushaf/pageAudio';
import { pageForAyah, pageForJump } from '@/mushaf/pageJump';
import {
  hideChrome,
  releaseChrome,
  toggleChrome,
  useChromeVisible,
} from '@/mushaf/chromeVisibility';
import { useAppSettings } from '@/settings/settingsStore';
import { useThemeColors } from '@/theme/themeContext';

/** Where the mushaf opens with nothing saved. Page 1 is the Fatiha. */
const FIRST_PAGE = 1;

/** One shared empty array, because it stands in effect dependency lists: a
 *  fresh `[]` per render would re-run them on every render. */
const NO_LINES: readonly MushafLine[] = [];

/**
 * The mushaf tab: the printed page, full screen, with no reader around it.
 *
 * It owns what the surah reader used to hand down, because a tab has no route
 * to take it from. That is the whole point of the split (M7d ruling 1): a page
 * is not a surah, and every prop the reader passed -- the surah, its ayah
 * count, its bookmarks -- was a surah-shaped answer to a page-shaped question.
 */
export function MushafScreen() {
  const {
    uiLocale,
    contentLanguage,
    reciterId,
    setReciterId,
  } = useAppSettings();
  const theme = useThemeColors();
  const [client, setClient] = useState<MobileDataClient | null>(null);
  // Null until the saved position has been read AND resolved to a page. The
  // pager takes its opening page at mount and owns it afterwards, so opening
  // on 1 and correcting to 106 a moment later would be a page turn the reader
  // did not ask for.
  const [initialPage, setInitialPage] = useState<number | null>(null);
  // The saved row itself, held until there is an index to resolve it against.
  // `page` is null on every row the SURAH reader wrote -- deliberately, since
  // it scrolls by ayah and a stale page would be worse than none (ruling 13) --
  // so taking `position.page ?? 1` opened the mushaf on the Fatiha for anyone
  // whose last session was in the reader, which is the common path.
  const [savedPosition, setSavedPosition] = useState<
    { surahId: number; ayahNumber: number; page: number | null } | null | undefined
  >(undefined);
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
  // Gated on focus, not on `chromeVisible` alone. This is a TAB screen: it
  // stays mounted after the user leaves it, so a request made from here
  // outlives the visit that made it and would hide the system buttons on
  // whatever tab they went to. `releaseChrome` on blur happens to cover that
  // today, but it is the same single-writer cleanup whose one skipped run
  // stranded the tab bar (#80) -- and the screen already knows whether it is
  // the one being looked at.
  const mushafFocused = useIsFocused();
  // Measured by the tab bar itself: its height is its icon, its label and its
  // padding at whatever type scale the device is set to, and a player docked
  // above a guessed one either overlaps the pill or floats over the page.
  const tabBarTop = useTabBarTop();
  const [jumpOpen, setJumpOpen] = useState(false);
  const [reciterOpen, setReciterOpen] = useState(false);
  // The page the pager is actually on. Null until it reports its first turn:
  // the reader takes `initialPage` at mount and never announces it, so
  // `?? initialPage` is not a fallback but the answer for the opening page.
  const [pageInView, setPageInView] = useState<number | null>(null);
  /** A page the reader has to be taken to without swiping there. */
  const [focusPage, setFocusPage] = useState<number | null>(null);
  const loadWordSummary = useWordSummaryLoader(client, null, contentLanguage);
  // The page in view, as rows. The INDEX cannot answer what the player needs:
  // `startAyahNumber` is the ayah a page opens in, which is a tail carried over
  // from the page before on most pages. Only the layout says which ayah begins
  // here. Held back until the opening page is known, so the cold start does not
  // fetch page 1's rows on its way to the page the reader actually saved.
  const currentPage = pageInView ?? initialPage;
  const pageData = useMushafPage(currentPage === null ? null : client, currentPage ?? FIRST_PAGE);
  // The rows of the page in front of the reader, and NOTHING otherwise. The
  // render in which the pager reports a turn still carries the previous page's
  // rows -- `useMushafPage`'s effect has not run yet -- and every reader below
  // is the player, which would then act on the page it has just left. That is
  // what turned page 1 to page 2 and started al-Fatiha over on it, then turned
  // a page per ayah: the playhead was never on the page in view.
  const pageLines = pageData.page === currentPage ? pageData.lines : NO_LINES;
  // Every bookmark, keyed by coordinate, re-read on every focus and resume.
  // The reader narrows its own to one surah because it only ever shows one; a
  // page can hold two, and the second surah's bookmarks are exactly what a
  // narrowed set drops. On focus and not at mount because a tab screen is
  // never unmounted: bookmarking a verse in the Surahs tab and coming back
  // otherwise left this screen showing -- and writing against -- what was true
  // when the app started.
  const savedBookmarks = useUserDbOnFocus(getBookmarks, t(uiLocale, 'bookmarks.loadFailed'));

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [corpusDb, userDb] = await Promise.all([openCorpusDb(), openUserDb()]);
        const corpus = createExpoSqliteClient(corpusDb as ExpoSqliteLike);
        const user = createExpoSqliteClient(userDb as ExpoSqliteLike);
        const position = await getLastReadingPosition(user);
        if (cancelled) return;
        setClient(corpus);
        setSavedPosition(position ?? null);
      } catch (cause) {
        // Logged for logcat, never shown: the pager still renders, and a page
        // that cannot load its rows draws its own paper ground.
        console.error('[mushaf] load failed', { cause });
        if (!cancelled) setSavedPosition(null);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const rows = savedBookmarks.data;
    if (!rows) return;
    // Straight over the local map, not merged: this read is what the database
    // says, and an optimistic toggle it does not contain is one that failed or
    // one this screen has already rolled back.
    setBookmarks(new Map(rows.map((bookmark) => [ayahKey(bookmark.surahId, bookmark.ayahNumber), bookmark.note])));
  }, [savedBookmarks.data]);

  // The opening page, resolved once and then never again: `initialPage` is
  // what the pager mounts on, and it owns the page after that.
  useEffect(() => {
    if (savedPosition === undefined || initialPage !== null) return;
    if (savedPosition === null) {
      setInitialPage(FIRST_PAGE);
      return;
    }
    if (savedPosition.page !== null) {
      setInitialPage(savedPosition.page);
      return;
    }
    // No page on the row, so it came from the surah reader: resolve the
    // coordinate it did leave. Waits for the index rather than falling back to
    // page 1, because page 1 is exactly the wrong answer here.
    if (!index.ready) return;
    setInitialPage(pageForAyah(index.pages, savedPosition.surahId, savedPosition.ayahNumber) ?? FIRST_PAGE);
  }, [savedPosition, initialPage, index.ready, index.pages]);

  // The chrome is the tab bar too. HIDDEN on arrival (owner ruling
  // 2026-09-10): the mushaf is a page of a book, and the first frame of it
  // should be the page and nothing else. A tap anywhere brings both bars back
  // for the 3.5s the idle timer allows. Released on the way out so no other
  // screen inherits a hidden bar or a pending countdown.
  //
  // On FOCUS, not on mount. A tab screen is not unmounted when the user leaves
  // it, so a mount-scoped release never ran: the 3.5s idle timer armed here
  // kept ticking after a switch to another tab and hid the app's tab bar
  // there, on a screen with no way to bring it back.
  useFocusEffect(
    useCallback(() => {
      hideChrome();
      return releaseChrome;
    }, []),
  );

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
    // Nothing in here reads a render value. It used to depend on `uiLocale`,
    // which rebuilt the recorder -- discarding whatever it had queued -- every
    // time the UI language changed.
    [],
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

  const audio = useRecitationController();
  // Whether the engine is sounding for US. It is one engine app-wide now, so a
  // recitation the reader started is audible here too -- and painting a band
  // for it would put a green highlight on a page the reader is not looking at,
  // driven by a screen they cannot see. Every read below goes through these
  // three rather than through `audio` directly.
  const mine = audio.track?.owner === 'mushaf';
  const sounding = mine && audio.playing;
  const soundingAyah = mine ? audio.ayah : null;
  const soundingFinished = mine && audio.finished;

  // The surah being recited, not the screen's -- a tab has none, and it moves
  // as continuous play crosses a surah boundary. It travels with the call
  // because the engine has no screen of its own to read it off.
  //
  // `continuous: true` unconditionally, NOT the saved setting (owner,
  // 2026-09-12). The only control here is one button saying "Play this page",
  // and a page is fifteen lines of ayahs -- a button making that promise and
  // then stopping after the first one is broken however the setting reads. The
  // setting still governs the reader, where play is a per-ayah control and
  // "just this ayah" is a coherent thing to ask for.
  const toggleAyah = useCallback(
    (ayahNumber: number, surahId: number) => {
      audio.toggle(
        {
          owner: 'mushaf',
          surahId,
          ayahCount: index.ayahCounts.get(surahId) ?? 0,
          surahName: index.surahNames.get(surahId) ?? '',
          continuous: true,
        },
        ayahNumber,
      );
    },
    [audio, index.ayahCounts, index.surahNames],
  );

  // The hook owns which ayah is sounding; this screen owns which surah that
  // ayah belongs to, so the two are reconciled here rather than duplicated.
  useEffect(() => {
    setPlaying((current) => {
      if (soundingAyah === null) return null;
      if (current === null) return null;
      return current.ayahNumber === soundingAyah
        ? current
        : { surahId: current.surahId, ayahNumber: soundingAyah };
    });
  }, [soundingAyah]);

  // What the player's play button starts.
  //
  // The parked ayah resumes when it is printed on the page in front of the
  // reader; anything else starts the page from the top. Both halves are
  // load-bearing. Pausing shrinks the player back to one line, so this IS the
  // resume control -- without the first case, pause-then-play would throw the
  // reader back to the top of the page and pausing would be a trap. And
  // without the second, a pause followed by two swipes would resume an ayah
  // that is nowhere on the page they are looking at.
  //
  // Null target means a page that begins no ayah at all -- 2:282 alone fills
  // more than a page -- and there is nothing there to start.
  const onTogglePlay = useCallback(() => {
    if (sounding && playing) {
      toggleAyah(playing.ayahNumber, playing.surahId);
      return;
    }
    const target = playing && ayahOnPage(pageLines, playing) ? playing : firstAyahOnPage(pageLines);
    if (target === null) return;
    // The surah goes with the call, and the state beside it: `useRecitation`
    // was rendered with the PREVIOUS `playing`, so the id it would infer on
    // its own is a page behind.
    setPlaying(target);
    toggleAyah(target.ayahNumber, target.surahId);
  }, [audio, playing, pageLines]);

  // The page the recitation has asked for and is waiting on the rows of, so it
  // can start that page's first ayah. Only set at a surah seam: everywhere
  // else the hook runs on by itself and the page merely follows.
  const [pendingPlayPage, setPendingPlayPage] = useState<number | null>(null);

  // The page follows the voice.
  //
  // Keyed on the PLAYHEAD alone, deliberately. A dependency on the page's rows
  // would turn a manual swipe into a page turn: swiping away mid-recitation
  // leaves the playhead on an ayah the new page does not carry, which is
  // exactly the state this effect reacts to. The pager is the truth about
  // which page is in view; this is a request, and a finger outranks it.
  useEffect(() => {
    if (!sounding || playing === null || currentPage === null) return;
    // No rows yet means the page is still arriving, not that the playhead has
    // left it -- and a turn on that reading would run through the whole juz
    // one page per query.
    if (pageLines.length === 0) return;
    if (ayahOnPage(pageLines, playing)) return;
    // Where the voice actually went, not `currentPage + 1`. The playhead moves
    // backwards too -- Previous from the first ayah of a page lands on the page
    // before -- and a fixed forward step turned AWAY from the ayah being
    // recited, two pages off it. The index knows the page an ayah is printed on
    // without reading any layout rows.
    const target = pageForAyah(index.pages, playing.surahId, playing.ayahNumber);
    if (target === null || target === currentPage) return;
    setFocusPage(target);
    // pageLines, currentPage and index are read, not watched: see above.
  }, [playing?.surahId, playing?.ayahNumber, sounding]);

  // The seam. `useRecitation` stops at the last ayah of a surah by design --
  // wrapping would restart al-Fatiha behind a locked screen -- and 51 pages
  // carry two surahs, so at those the hook will not advance and the screen has
  // to. Turn the page, then start whatever it begins once its rows arrive.
  useEffect(() => {
    if (!soundingFinished || currentPage === null || playing === null) return;
    // The rest of THIS page first. A surah does not have to end where a page
    // does: 54 pages carry two or three, so page 106 finishes surah 4 with 5:1
    // and 5:2 still printed below it, and page 604 hides the whole of 113 and
    // 114 behind the end of 112. Turning here skipped every one of them.
    const next = nextAyahOnPage(pageLines, playing);
    if (next !== null) {
      setPlaying(next);
      toggleAyah(next.ayahNumber, next.surahId);
      return;
    }
    // The last page begins nothing further and there is no page after it; a
    // turn request the pager refuses would leave `pendingPlayPage` set for
    // ever, and the next manual swipe would start reciting on its own.
    if (currentPage >= MUSHAF_PAGE_MAX) return;
    setFocusPage(currentPage + 1);
    setPendingPlayPage(currentPage + 1);
  }, [soundingFinished]);

  useEffect(() => {
    // `currentPage === pendingPlayPage` is what keeps this off the page being
    // left: until the pager reports the turn these rows are the old page's,
    // and its first ayah is the one that has just finished.
    if (pendingPlayPage === null || currentPage !== pendingPlayPage) return;
    if (pageLines.length === 0) return;
    setPendingPlayPage(null);
    const target = firstAyahOnPage(pageLines);
    // A page that begins nothing -- 2:282 alone fills more than one -- has
    // nothing to start, and the recitation ends there rather than skipping an
    // ayah the reader can see.
    if (target === null) return;
    setPlaying(target);
    toggleAyah(target.ayahNumber, target.surahId);
  }, [pendingPlayPage, currentPage, pageLines]);

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
        // Sounding, not parked: `playing` is the ayah the player sits ON and
        // survives a pause, so passing it raw kept an ayah lit with nothing
        // coming out of it. The reader draws the same distinction.
        playingAyah={sounding ? playing : null}
        focusPage={focusPage}
        uiLocale={uiLocale}
        onPageChange={(page) => {
          // Cleared once the pager has arrived, or the next jump to the same
          // page would be a prop that never changes and so never moves it.
          setFocusPage(null);
          // A page that is not the one the seam asked for means the reader
          // swiped somewhere else, and the request is stale: left standing, it
          // would fire minutes later when a swipe happened to land on that page
          // and start reciting with nothing pressed.
          setPendingPlayPage((pending) => (pending === null || pending === page ? pending : null));
          setPageInView(page);
          onPageChange(page);
        }}
        onWordPress={onWordPress}
        onTap={toggleChrome}
        onLanded={noop}
      />
      <MushafPlayer
        // Sounding, not parked. Keyed on the parked ayah the bar would never
        // shrink back to one line: the parking spot outlives a pause on
        // purpose, so that resuming knows where to go.
        playing={sounding}
        ayahNumber={soundingAyah}
        positionSec={audio.positionSec}
        durationSec={audio.durationSec}
        reciterLabel={reciterById(reciterId)?.label ?? ''}
        uiLocale={uiLocale}
        onTogglePlay={onTogglePlay}
        onSkipNext={audio.skipNext}
        onSkipPrevious={audio.skipPrevious}
        onSeek={audio.seekTo}
        onOpenReciters={() => setReciterOpen(true)}
        bottomOffset={tabBarTop + 8}
      />
      {/* The page number is printed in a bottom corner of the leaf (ruling 8),
          which on a device with three-button navigation is exactly where the
          buttons sit (owner, on an S24, 2026-09-15). So they leave with the
          rest of the chrome: tap to bring the bars back, and the reading state
          -- chrome down -- is the state where the whole page is visible. */}
      <NavigationBar hidden={mushafFocused && !chromeVisible} />
      {/* And the status bar with it (M8 ruling 1), so the leaf runs to the top
          edge of the glass. Same gate as the navigation bar, for the same
          reason: this is a tab screen that stays mounted after a blur, and a
          standing request left behind would take the clock off every other
          tab. The page itself does not move -- see useStableInsets. */}
      <StatusBar hidden={mushafFocused && !chromeVisible} />
      <MushafChrome
        visible={chromeVisible}
        uiLocale={uiLocale}
        onOpenJump={() => setJumpOpen(true)}
        onOpenSearch={() => router.push('/search')}
      />
      {jumpOpen ? (
        <PageJumpSheet uiLocale={uiLocale} onClose={() => setJumpOpen(false)} onJump={onJump} />
      ) : null}
      {reciterOpen ? (
        <ReciterSheet
          current={reciterId}
          uiLocale={uiLocale}
          // The playhead is left alone. `useRecitation` reloads the source
          // under the new voice at the next press, and a picker that restarted
          // the ayah would punish a reader for browsing the list.
          onSelect={setReciterId}
          onClose={() => setReciterOpen(false)}
        />
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
                  // `audio.playing` is the sound; `playing` is only which ayah
                  // the player is parked on and stays put across a pause. Left
                  // off, the sheet's control sat on Pause for ever once an
                  // ayah had been pressed -- it paused, and said it had not.
                  playing={
                    sounding &&
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
                    // The surah goes with the call. `useRecitation` was
                    // rendered with the PREVIOUS `playing`, so on the first
                    // press it holds null and nothing sounds at all, and on a
                    // page carrying two surahs it holds the other one.
                    toggleAyah(openMushafWord.ayahNumber, openMushafWord.surahId);
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
