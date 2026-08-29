import { Link } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, SectionList, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';

import { GlassSurface } from '@/components/GlassSurface';
import { NoteEditor } from '@/components/NoteEditor';
import { SegmentedControl } from '@/components/SegmentedControl';
import { getBookmarkAyahTexts, getSurahList } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { useUserDbOnFocus } from '@/data/useUserDbOnFocus';
import { openUserDb } from '@/data/userDb';
import {
  getBookmarks,
  setBookmarkNote,
  type Bookmark,
} from '@/data/userRepository';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { typography } from '@/theme/tokens';
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

  const renderRow = useCallback(
    ({ item }: { item: Bookmark }) => (
      <BookmarkRow
        bookmark={item}
        text={texts.get(keyOf(item)) ?? null}
        uiLocale={uiLocale}
        onEditNote={() => setEditing(item)}
      />
    ),
    [texts, uiLocale],
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
          contentContainerStyle={{ paddingBottom, paddingHorizontal: 16, gap: 10 }}
        />
      ) : (
        <FlatList
          testID="bookmarks-list"
          data={visible}
          keyExtractor={(item) => `${tab}-${keyOf(item)}`}
          renderItem={renderRow}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom, paddingHorizontal: 16, gap: 10 }}
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
    </View>
  );
}

function BookmarkRow({
  bookmark,
  text,
  uiLocale,
  onEditNote,
}: {
  bookmark: Bookmark;
  text: string | null;
  uiLocale: UiLocaleCode;
  onEditNote: () => void;
}) {
  const theme = useThemeColors();
  const coordinate = `${bookmark.surahId}:${bookmark.ayahNumber}`;

  return (
    <GlassSurface testID={`bookmark-row-${bookmark.surahId}-${bookmark.ayahNumber}`} style={{ padding: 14, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Link
          href={{
            pathname: '/surah/[surahId]',
            params: { surahId: String(bookmark.surahId), ayah: String(bookmark.ayahNumber) },
          }}
          accessibilityRole="link"
          accessibilityLabel={`${t(uiLocale, 'bookmarks.entryPrefix')} ${coordinate}`}
          style={{ color: theme.accent, fontWeight: '700' }}
        >
          {coordinate}
        </Link>
        <Text
          accessibilityRole="button"
          // The label distinguishes the two states, because the icon alone does
          // not reach TalkBack.
          accessibilityLabel={t(uiLocale, bookmark.note === null ? 'bookmarks.addNote' : 'bookmarks.editNote')}
          onPress={onEditNote}
          style={{
            // Same pair the reader uses (AyahCard, MushafAyah): a filled nib in
            // the accent for a note that exists, an outline in muted for one to
            // be written. Both branches were the same glyph in the same colour,
            // so the row said nothing to a sighted user.
            color: bookmark.note === null ? theme.mutedText : theme.accent,
            paddingHorizontal: 8,
            paddingVertical: 4,
          }}
        >
          {bookmark.note === null ? '✎' : '✐'}
        </Text>
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
        <Text numberOfLines={3} style={{ color: theme.mutedText }}>
          {bookmark.note}
        </Text>
      ) : null}
    </GlassSurface>
  );
}
