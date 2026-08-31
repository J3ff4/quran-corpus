import { Link, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, SectionList, Text, View } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';

import { ConfirmSheet } from '@/components/ConfirmSheet';
import { GlassSurface } from '@/components/GlassSurface';
import { Icon } from '@/components/icons/Icon';
import { NoteEditor } from '@/components/NoteEditor';
import { SegmentedControl } from '@/components/SegmentedControl';
import { getBookmarkAyahTexts, getSurahList } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { useUserDbOnFocus } from '@/data/useUserDbOnFocus';
import { openUserDb } from '@/data/userDb';
import {
  getBookmarks,
  setBookmark,
  setBookmarkNote,
  type Bookmark,
} from '@/data/userRepository';
import type { UiLocaleCode } from '@/i18n/languages';
import { textAlignFor } from '@/i18n/textDirection';
import { t } from '@/i18n/uiStrings';
import {
  ICON_MIN_SCALE,
  ICON_THRESHOLD,
  PANEL_GAP,
  PANEL_WIDTH,
  iconProgress,
  iconScale,
  panelWidth,
} from '@/motion/swipePanel';
import { useAppSettings } from '@/settings/settingsStore';
import { radii, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

/** Which ordering the list is in. Not "History": reading history is Home's
 *  continue-reading card and does not belong here. All three show the same
 *  rows; only the order and the filter differ. */
type BookmarkTab = 'recent' | 'surah' | 'notes';

interface BookmarksData {
  bookmarks: Bookmark[];
  /** `surah:ayah` -> the ayah's text. Absent for a coordinate the corpus has
   *  no row for, which a row renders as a coordinate with no text. */
  texts: Map<string, string>;
  /** surah id -> transliterated name, for the By-surah headers. */
  surahNames: Map<number, string>;
}

function keyOf(bookmark: Bookmark): string {
  return `${bookmark.surahId}:${bookmark.ayahNumber}`;
}

/** Loads the bookmarks and everything needed to render them.
 *
 *  The corpus DB is opened here rather than held in state: this runs on focus,
 *  and a client cached across focuses would outlive the screen for no gain --
 *  the ayah texts have to be re-fetched anyway, because the bookmark list they
 *  key off may have changed while the tab was away.
 */
async function loadBookmarksData(userClient: MobileDataClient): Promise<BookmarksData> {
  const bookmarks = await getBookmarks(userClient);
  if (bookmarks.length === 0) {
    return { bookmarks, texts: new Map(), surahNames: new Map() };
  }

  const corpusDb = await openCorpusDb();
  const corpusClient = createExpoSqliteClient(corpusDb as ExpoSqliteLike);
  // Parallel: neither needs the other, and both are on the same bundled file.
  const [texts, surahs] = await Promise.all([
    getBookmarkAyahTexts(corpusClient, bookmarks),
    getSurahList(corpusClient),
  ]);

  return {
    bookmarks,
    texts,
    surahNames: new Map(surahs.map((surah) => [surah.id, surah.nameTranslit])),
  };
}

export function BookmarksScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();
  const [tab, setTab] = useState<BookmarkTab>('recent');
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  /** The bookmark a confirm sheet is open for. Only ever a noted one -- see
   *  requestDelete. */
  const [confirming, setConfirming] = useState<Bookmark | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(loadBookmarksData, []);
  const { data, loading, error, reload } = useUserDbOnFocus(
    load,
    t(uiLocale, 'bookmarks.loadFailed'),
  );

  const bookmarks = useMemo(() => data?.bookmarks ?? [], [data]);
  const texts = data?.texts ?? new Map<string, string>();
  const surahNames = data?.surahNames ?? new Map<number, string>();

  // getBookmarks returns mushaf order, which is exactly the By-surah order, so
  // that tab re-uses the array as it came. Recent has to re-sort: a tab that
  // forgot to would be indistinguishable from By surah until the reader saved
  // something out of order, which is the normal case.
  const recent = useMemo(
    () =>
      [...bookmarks].sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) ||
          a.surahId - b.surahId ||
          a.ayahNumber - b.ayahNumber,
      ),
    [bookmarks],
  );
  const noted = useMemo(() => recent.filter((bookmark) => bookmark.note !== null), [recent]);

  const sections = useMemo(() => {
    const bySurah = new Map<number, Bookmark[]>();
    for (const bookmark of bookmarks) {
      const rows = bySurah.get(bookmark.surahId);
      if (rows) rows.push(bookmark);
      else bySurah.set(bookmark.surahId, [bookmark]);
    }
    // Insertion order is mushaf order, because `bookmarks` already is.
    return [...bySurah].map(([surahId, rows]) => ({
      surahId,
      title: surahNames.get(surahId) ?? String(surahId),
      data: rows,
    }));
  }, [bookmarks, surahNames]);

  const surahCount = useMemo(
    () => new Set(bookmarks.map((bookmark) => bookmark.surahId)).size,
    [bookmarks],
  );

  async function saveNote(bookmark: Bookmark, note: string) {
    try {
      setNoteError(null);
      const userDb = await openUserDb();
      const userClient = createExpoSqliteClient(userDb as ExpoSqliteLike);
      await setBookmarkNote(userClient, bookmark.surahId, bookmark.ayahNumber, note);
      setEditing(null);
      // Re-read rather than patch: normalizeNote trims, caps and strips, so the
      // stored note is not always the typed one. Showing the typed one would
      // disagree with the database until the next focus.
      reload();
    } catch (cause) {
      // The note itself is never logged (decision 34: nothing new leaves the
      // device, and a note is exactly the kind of string a log swallows).
      console.error('[bookmarks] note write failed', {
        surahId: bookmark.surahId,
        ayahNumber: bookmark.ayahNumber,
        cause,
      });
      setNoteError(t(uiLocale, 'bookmarks.noteFailed'));
    }
  }

  async function deleteBookmark(bookmark: Bookmark) {
    try {
      setDeleteError(null);
      const userDb = await openUserDb();
      const userClient = createExpoSqliteClient(userDb as ExpoSqliteLike);
      await setBookmark(userClient, bookmark.surahId, bookmark.ayahNumber, false);
      setConfirming(null);
      // Re-read rather than splice the row out of local state: the row is gone
      // because the DELETE ran, and a list that drops it optimistically shows a
      // bookmark as deleted that a failed write left in place.
      reload();
    } catch (cause) {
      // Coordinate only, never the note -- same reason saveNote logs neither.
      console.error('[bookmarks] delete failed', {
        surahId: bookmark.surahId,
        ayahNumber: bookmark.ayahNumber,
        cause,
      });
      setDeleteError(t(uiLocale, 'bookmarks.deleteFailed'));
    }
  }

  /** Confirm only where something unrecoverable is at stake.
   *
   *  A bookmark with no note is one tap in the reader to make again, so a sheet
   *  in front of it is a tax on the common case. A note is text the reader
   *  typed, and nothing on this device can get it back -- the user DB has no
   *  undo and nothing leaves the phone (decision 34).
   */
  function requestDelete(bookmark: Bookmark) {
    // Cleared here, not only in deleteBookmark: the sheet is handed
    // `deleteError`, so a failure left over from some earlier row would open
    // the confirmation already reporting a write that has not run yet.
    setDeleteError(null);
    if (bookmark.note === null) void deleteBookmark(bookmark);
    else setConfirming(bookmark);
  }

  const renderRow = useCallback(
    ({ item }: { item: Bookmark }) => (
      <BookmarkRow
        bookmark={item}
        text={texts.get(keyOf(item)) ?? null}
        // Named in the two flat tabs, not in By surah: that tab already carries
        // the name in its section header, and repeating it in every row under
        // it is the header read twice.
        surahName={tab === 'surah' ? null : surahNames.get(item.surahId) ?? null}
        uiLocale={uiLocale}
        onEditNote={() => setEditing(item)}
        onDelete={() => requestDelete(item)}
      />
    ),
    // requestDelete is redeclared every render and closes over nothing that
    // changes, so it stays out of the deps: listing it would rebuild the row
    // callback on every render and defeat the memo.
    [texts, surahNames, tab, uiLocale],
  );

  const visible = tab === 'notes' ? noted : recent;
  const empty = tab === 'notes' ? 'bookmarks.noNotes' : 'bookmarks.empty';

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 10 }}>
        <Text
          accessibilityRole="header"
          style={{ color: theme.text, fontSize: typography.title, fontWeight: '700' }}
        >
          {t(uiLocale, 'tabs.bookmarks')}
        </Text>
        {/* Counts, then where the data lives. Never "synced" -- nothing leaves
            the phone (decision 34), and the mockup's caption would be a promise
            the app does not keep. */}
        <Text style={{ color: theme.mutedText }}>
          {`${bookmarks.length} ${t(uiLocale, 'bookmarks.ayahsLabel')} · ${surahCount} ${t(
            uiLocale,
            'bookmarks.surahsLabel',
          )} · ${t(uiLocale, 'bookmarks.onThisDevice')}`}
        </Text>
        <SegmentedControl
          options={[
            { value: 'recent' as const, label: t(uiLocale, 'bookmarks.tabRecent') },
            { value: 'surah' as const, label: t(uiLocale, 'bookmarks.tabBySurah') },
            { value: 'notes' as const, label: t(uiLocale, 'bookmarks.tabWithNotes') },
          ]}
          value={tab}
          onChange={setTab}
          accessibilityLabel={t(uiLocale, 'bookmarks.sort')}
        />
        {/* Inline, not a full-screen spinner: this re-reads on every focus, and
            a blocking spinner tore down the list the reader was looking at and
            then put it back. */}
        {loading ? <ActivityIndicator /> : null}
        {error ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
            {error}
          </Text>
        ) : null}
        {/* A delete that failed with no sheet open -- the un-noted path, which
            deletes without confirming. When a sheet IS open the same string goes
            inside it instead, because a <Modal> is its own native window and an
            alert behind it is announced to nobody. */}
        {deleteError && !confirming ? (
          <Text
            testID="bookmark-delete-error"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ color: theme.danger }}
          >
            {deleteError}
          </Text>
        ) : null}
      </View>

      {!loading && !error && visible.length === 0 ? (
        <Text style={{ color: theme.mutedText, padding: 20 }}>{t(uiLocale, empty)}</Text>
      ) : null}

      {tab === 'surah' ? (
        <SectionList
          testID="bookmarks-list"
          sections={sections}
          // The tab is in the key so switching cannot hand a recycled row the
          // wrong item.
          keyExtractor={(item) => `surah-${keyOf(item)}`}
          renderItem={renderRow}
          renderSectionHeader={({ section }) => (
            <Text
              accessibilityRole="header"
              style={{
                color: theme.mutedText,
                paddingHorizontal: 16,
                paddingTop: 14,
                paddingBottom: 6,
                fontWeight: '700',
              }}
            >
              {section.title}
            </Text>
          )}
          style={{ flex: 1 }}
          // No paddingTop here: the first section header already carries 14.
          contentContainerStyle={{ paddingBottom, paddingHorizontal: 16, gap: 10 }}
        />
      ) : (
        <FlatList
          testID="bookmarks-list"
          data={visible}
          keyExtractor={(item) => `${tab}-${keyOf(item)}`}
          renderItem={renderRow}
          style={{ flex: 1 }}
          // paddingTop, unlike the SectionList above: nothing here heads the
          // list, so the first card sat flush against the segmented control.
          contentContainerStyle={{ paddingTop: 10, paddingBottom, paddingHorizontal: 16, gap: 10 }}
        />
      )}

      {editing ? (
        <NoteEditor
          surahId={editing.surahId}
          ayahNumber={editing.ayahNumber}
          note={editing.note}
          uiLocale={uiLocale}
          // Inside the sheet, not on the list behind it: the sheet is a <Modal>
          // and stays open after a failed write, so an alert on this screen is
          // covered and never announced.
          error={noteError}
          onCancel={() => setEditing(null)}
          onSave={(note) => {
            void saveNote(editing, note);
          }}
        />
      ) : null}

      {confirming ? (
        <ConfirmSheet
          title={t(uiLocale, 'bookmarks.discardNoteTitle')}
          body={t(uiLocale, 'bookmarks.discardNoteBody')}
          confirmLabel={t(uiLocale, 'bookmarks.discardNoteConfirm')}
          uiLocale={uiLocale}
          error={deleteError}
          onCancel={() => {
            setConfirming(null);
            setDeleteError(null);
          }}
          onConfirm={() => {
            void deleteBookmark(confirming);
          }}
        />
      ) : null}
    </View>
  );
}

/** The delete panel that a right-swipe uncovers.
 *
 *  Its own component, not an inline render, because it holds two animated
 *  styles and a component is the only place hooks may live. The two values
 *  come from the library: `progress` is 0..1 across the panel's width, and
 *  `translation` is the row's translateX, negative here.
 *
 *  The outer Pressable keeps its full width at rest even though nothing is
 *  drawn in it. ReanimatedSwipeable measures the actions it renders to decide
 *  how far the row may travel (`rightWidth`, read on gesture start), so a
 *  panel that started at width 0 would measure 0 and the row would not open at
 *  all. The growing part is therefore an inner view inside a box of constant
 *  size.
 */
function SwipeDeleteAction({
  progress,
  translation,
  label,
  testID,
  onPress,
}: {
  progress: SharedValue<number>;
  translation: SharedValue<number>;
  label: string;
  testID: string;
  onPress: () => void;
}) {
  const theme = useThemeColors();

  // Read on this side of the worklet boundary, deliberately. A worklet closes
  // over the identifiers its body names, and a module constant reached only
  // from inside another worklet's default argument is not one of them -- see
  // the note at the top of motion/swipePanel.
  const gap = PANEL_GAP;
  const max = PANEL_WIDTH;
  const threshold = ICON_THRESHOLD;
  const minScale = ICON_MIN_SCALE;

  const fill = useAnimatedStyle(() => ({ width: panelWidth(translation.value, gap, max) }));
  const glyph = useAnimatedStyle(() => {
    const arriving = iconProgress(progress.value, threshold);
    return { opacity: arriving, transform: [{ scale: iconScale(arriving, minScale) }] };
  });

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: PANEL_WIDTH, marginLeft: PANEL_GAP }}
    >
      {/* Pinned to the right edge and grown leftwards, so the panel's leading
          edge tracks the card and its trailing edge stays put. Grown from the
          left instead, the whole panel would slide in from off-screen while
          the gap it is filling opens from the other side. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            borderRadius: radii.card,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            // dangerFill, not danger: `danger` is tuned to be readable error
            // TEXT on night, and as a solid panel it is a pale pink block.
            backgroundColor: theme.dangerFill,
          },
          fill,
        ]}
      >
        <Animated.View style={glyph}>
          <Icon name="trash" color={theme.onDangerFill} size={22} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function BookmarkRow({
  bookmark,
  text,
  surahName,
  uiLocale,
  onEditNote,
  onDelete,
}: {
  bookmark: Bookmark;
  text: string | null;
  /** The transliterated surah name, or null to show the bare coordinate. */
  surahName: string | null;
  uiLocale: UiLocaleCode;
  onEditNote: () => void;
  onDelete: () => void;
}) {
  const theme = useThemeColors();
  const router = useRouter();
  const swipe = useRef<SwipeableMethods>(null);
  const coordinate = `${bookmark.surahId}:${bookmark.ayahNumber}`;
  // "Al-Baqara 2:255", not "2:255": the number alone identifies the ayah only
  // to someone who already knows the surah order.
  const label = surahName ? `${surahName} ${coordinate}` : coordinate;

  // One href, two consumers -- the Link below and the card's own press. Writing
  // it twice is how the two paths end up navigating to different places.
  const href = {
    pathname: '/surah/[surahId]',
    params: { surahId: String(bookmark.surahId), ayah: String(bookmark.ayahNumber) },
  } as const;

  function deleteFromSwipe() {
    // Closed first: the sheet the confirm path opens leaves this row on screen
    // behind it, and a row still held open under a sheet is what the user comes
    // back to after cancelling.
    swipe.current?.close();
    onDelete();
  }

  return (
    <Swipeable
      ref={swipe}
      friction={2}
      rightThreshold={40}
      // No overshoot: the panel is a fixed-width target, and letting the row
      // travel past it opens a gap the delete control does not fill.
      overshootRight={false}
      // The library's own container is overflow:hidden, which clips the card's
      // drop shadow -- the one thing separating a glass card from the bloom.
      // The action panel is absoluteFill-clipped in its own right, so opening
      // this up lets the shadow through without letting the panel escape.
      containerStyle={{ overflow: 'visible' }}
      renderRightActions={(progress, translation) => (
        <SwipeDeleteAction
          progress={progress}
          translation={translation}
          label={t(uiLocale, 'bookmarks.delete')}
          testID={`bookmark-swipe-delete-${bookmark.surahId}-${bookmark.ayahNumber}`}
          onPress={deleteFromSwipe}
        />
      )}
    >
      <GlassSurface testID={`bookmark-row-${bookmark.surahId}-${bookmark.ayahNumber}`}>
        {/* The whole card opens the ayah, not just the coordinate: the coordinate
            alone measured 81x76px on a 640dpi device (2026-08-29), and even
            padded to 48dp it left most of a card the reader would reasonably
            tap doing nothing.

            accessible={false} on purpose. A Pressable is accessible by default,
            and an accessible container COLLAPSES its children on Android --
            which would take the note and delete buttons off TalkBack entirely.
            So the card is the sighted target, and the three controls inside it
            stay three separate screen-reader targets. rnHosts drops the prop,
            so no unit test can catch a regression here; it is a device check. */}
        <Pressable
          testID={`bookmark-card-${bookmark.surahId}-${bookmark.ayahNumber}`}
          accessible={false}
          onPress={() => router.push(href)}
          style={{ padding: 14, gap: 8 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Link
              href={href}
              accessibilityRole="link"
              accessibilityLabel={`${t(uiLocale, 'bookmarks.entryPrefix')} ${label}`}
              // No touch-target padding any more: the card behind it is the
              // target, and padding here only pushed the row's own controls
              // apart.
              style={{ color: theme.accent, fontWeight: '700', flexShrink: 1 }}
              numberOfLines={1}
            >
              {label}
            </Link>
            {/* A gap, because the right-hand control deletes. Un-noted
                bookmarks delete straight out with no confirmation, so two 48dp
                targets sharing an edge means a tap a few points wide of "Add
                note" removes the row -- and the user DB has no undo. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable
                testID={`bookmark-note-${bookmark.surahId}-${bookmark.ayahNumber}`}
                accessibilityRole="button"
                // The label distinguishes the two states, because the glyph alone does
                // not reach TalkBack.
                accessibilityLabel={t(uiLocale, bookmark.note === null ? 'bookmarks.addNote' : 'bookmarks.editNote')}
                onPress={onEditNote}
                // A tap target, not a text run: the ✎/✐ pair this replaced was two
                // font glyphs that rendered at whatever weight the system face had,
                // beside two SVG controls in the reader doing the same job.
                style={{
                  minWidth: touchTargets.minimum,
                  minHeight: touchTargets.minimum,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {/* Same pair the reader uses (AyahCard, MushafAyah): filled in the
                    accent for a note that exists, outline in muted for one still to
                    be written. */}
                <Icon
                  testID={`bookmark-note-icon-${bookmark.surahId}-${bookmark.ayahNumber}`}
                  name="note"
                  filled={bookmark.note !== null}
                  color={bookmark.note === null ? theme.mutedText : theme.accent}
                  size={20}
                />
              </Pressable>
              {/* A visible control as well as the swipe. Swipe alone is an
                  invisible affordance, and TalkBack cannot perform one at all
                  (WCAG 2.5.1) -- the gesture is the shortcut, this is the way. */}
              <Pressable
                testID={`bookmark-delete-${bookmark.surahId}-${bookmark.ayahNumber}`}
                accessibilityRole="button"
                accessibilityLabel={t(uiLocale, 'bookmarks.delete')}
                onPress={onDelete}
                style={{
                  minWidth: touchTargets.minimum,
                  minHeight: touchTargets.minimum,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  testID={`bookmark-delete-icon-${bookmark.surahId}-${bookmark.ayahNumber}`}
                  name="trash"
                  color={theme.mutedText}
                  size={20}
                />
              </Pressable>
            </View>
          </View>
          {text ? (
            <Text
              numberOfLines={2}
              style={{ color: theme.text, fontSize: typography.body, textAlign: 'right', writingDirection: 'rtl' }}
            >
              {text}
            </Text>
          ) : null}
          {bookmark.note !== null ? (
            // Aligned by what the reader wrote, not by the interface locale: an
            // Arabic note shapes correctly but sat flush left, because Android
            // resolves a Text's gravity from the layout direction and the app is
            // LTR in all three UI locales (device, 2026-08-29).
            <Text
              numberOfLines={3}
              style={{ color: theme.mutedText, textAlign: textAlignFor(bookmark.note) }}
            >
              {bookmark.note}
            </Text>
          ) : null}
        </Pressable>
      </GlassSurface>
    </Swipeable>
  );
}
