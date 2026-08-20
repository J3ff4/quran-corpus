import { Fragment, useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { trimConcordanceVerse, type ConcordanceEntry } from '@quran-corpus/data/mobile';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

// One screenful and a bit: large enough that a scroll rarely waits, small
// enough that the first page lands immediately on a hot root.
const PAGE = 20;

export interface ConcordanceListProps {
  /** Occurrence count. Must not change unless the list really is a different
   *  one: like `loadPage`, a change is read as "a new root/lemma" and wipes
   *  what is loaded. */
  total: number;
  /** MUST be stable across parent renders (useCallback or a module-level fn).
   *  A fresh identity restarts the list from page 0 and discards what is
   *  loaded, so an inline arrow silently refetches on every parent render. */
  loadPage: (offset: number, limit: number) => Promise<ConcordanceEntry[]>;
  header: ReactElement;
}

/** Paged occurrences under a screen's own header. Shared by the root and lemma
 *  screens, which differ only in header and loader.
 *
 *  Rows are Pressable, not Link: expo-router's Link renders a Text on native,
 *  and the row is a two-line layout whose Views would not lay out inside one. */
export function ConcordanceList({ total, loadPage, header }: ConcordanceListProps) {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();

  const [entries, setEntries] = useState<ConcordanceEntry[]>([]);
  // Starts true when there is anything to load: `loading` is what suppresses
  // the empty state, and a first frame committed with it false flashes "no
  // occurrences" on every root before the mount effect runs.
  const [loading, setLoading] = useState(total > 0);
  const [failed, setFailed] = useState(false);
  // Refs, not state: onEndReached fires repeatedly while the list settles, and
  // a state read there is a frame behind, which requests the same page twice.
  const busyRef = useRef(false);
  const offsetRef = useRef(0);
  // Which list a request belongs to. A content-language change swaps `loadPage`
  // while a page is in flight; without this the old page appends its stale rows
  // to the new list, double-advances the offset (so a range is skipped and then
  // re-requested under duplicate keys) and frees busyRef under the live request.
  const genRef = useRef(0);

  const loadMore = useCallback(async () => {
    if (busyRef.current) return;
    if (offsetRef.current >= total) return;
    // After the guards, not before: a bump on the repeated onEndReached calls
    // that bounce off busyRef would orphan the request that is actually running.
    const gen = ++genRef.current;
    busyRef.current = true;
    setLoading(true);
    try {
      const page = await loadPage(offsetRef.current, PAGE);
      if (gen !== genRef.current) return;
      offsetRef.current += page.length;
      setEntries((current) => [...current, ...page]);
      // A short page means the source is exhausted whatever `total` claims --
      // the query is LIMIT-bound, so it can only come up short at the end.
      // Without this the list retries the same tail offset forever.
      if (page.length < PAGE) offsetRef.current = total;
    } catch (cause) {
      if (gen !== genRef.current) return;
      console.error('[concordance] page load failed', { offset: offsetRef.current, cause });
      // Stop paging AND say so. Falling through to the empty state would
      // render a broken read as "this root has no occurrences" (m-5).
      offsetRef.current = total;
      setFailed(true);
    } finally {
      // Runs on the early returns above too, so it has to check as well:
      // clearing these for a superseded request unblocks a third concurrent one.
      if (gen === genRef.current) {
        busyRef.current = false;
        setLoading(false);
      }
    }
  }, [loadPage, total]);

  useEffect(() => {
    genRef.current += 1;
    offsetRef.current = 0;
    busyRef.current = false;
    setEntries([]);
    setFailed(false);
    // The same value the first mount starts on, for the same reason -- and it
    // has to be set here rather than left to loadMore, because on an empty list
    // loadMore returns before its `finally`, and the superseded request's
    // `finally` is guarded, so nothing else would ever clear the spinner.
    setLoading(total > 0);
    void loadMore();
    // loadMore changes with the loader, which is what a new root or lemma is;
    // `total` is listed only because loadMore already folds it in.
  }, [loadMore, total]);

  const renderItem = useCallback(
    ({ item }: { item: ConcordanceEntry }) => {
      // Same window web shows: the clause around the match, capped, with the
      // flags saying which side was cut.
      const trimmed = trimConcordanceVerse(item.verse_words, item.word_id);
      return (
        <Pressable
          testID="concordance-row"
          accessibilityRole="link"
          // Pressable is one accessibility node, so this label replaces the
          // subtree's text rather than adding to it -- the verse has to be in
          // here or it is unreachable without opening every row. Reference and
          // gloss lead because they identify the row; the Arabic reads as one
          // long run and belongs last. t() has no interpolation.
          accessibilityLabel={`${item.surah_id}:${item.ayah_number}${item.gloss ? `, ${item.gloss}` : ''}, ${trimmed.words.map((word) => word.text_arabic).join(' ')}`}
          onPress={() => router.push(`/surah/${item.surah_id}?ayah=${item.ayah_number}`)}
          style={{
            paddingHorizontal: 20,
            paddingVertical: 12,
            minHeight: touchTargets.minimum,
            gap: 4,
          }}
        >
          <View
            // RTL, as in AlphabetGrid and FrequencyList: the Arabic takes the
            // start (right) edge, the reference the end.
            style={{
              flexDirection: 'row-reverse',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <Text
              style={{
                color: theme.text,
                fontFamily: 'Hafs',
                fontSize: typography.body,
                writingDirection: 'rtl',
              }}
            >
              {item.text_arabic}
            </Text>
            <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
              {item.surah_id}:{item.ayah_number}
            </Text>
          </View>

          {item.gloss ? (
            <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
              {item.gloss}
            </Text>
          ) : null}

          <Text
            testID="concordance-verse"
            style={{
              color: theme.mutedText,
              fontFamily: 'Hafs',
              // typography.body, not useArabicSizes: this is a list row, not
              // reading text -- sizes.reader is 28px and would make one
              // occurrence fill the screen. The reader's own size setting
              // governs the reader.
              fontSize: typography.body,
              writingDirection: 'rtl',
              // Full-width block child of a column Pressable, so textAlign
              // places it (unlike FrequencyList's content-sized flex child).
              textAlign: 'right',
            }}
          >
            {/* Dimmed like web's text-paper-400: the sentinels mark a cut, they
                are not part of the verse and must not read as its words. */}
            {trimmed.truncatedBefore ? <Text style={{ color: theme.border }}>… </Text> : ''}
            {trimmed.words.map((word, index) => (
              // The separator sits outside the word's own Text so the tinted
              // node is exactly the match -- a leading space inside it widens
              // the tint and makes the match unassertable by its text.
              <Fragment key={word.id}>
                {index > 0 ? ' ' : ''}
                <Text
                  testID={word.id === item.word_id ? 'concordance-match' : undefined}
                  // Nesting Text per word is safe here where SegmentedWord had
                  // to join runs by hand (f409ed0): Arabic does not shape
                  // across a space, so a word boundary breaks nothing.
                  //
                  // Wash as well as tint: hue alone is ~1.26:1 against the
                  // surrounding muted text, so the match is unfindable with a
                  // colour-vision deficiency. No bold (Hafs is single-weight
                  // and Android fakes it) and no underline (it collides with
                  // the sub-baseline diacritics).
                  style={
                    word.id === item.word_id
                      ? { color: theme.accent, backgroundColor: theme.accentWash }
                      : undefined
                  }
                >
                  {word.text_arabic}
                </Text>
              </Fragment>
            ))}
            {trimmed.truncatedAfter ? <Text style={{ color: theme.border }}> …</Text> : ''}
          </Text>
        </Pressable>
      );
    },
    [theme],
  );

  return (
    <FlatList
      data={entries}
      keyExtractor={(item) => String(item.word_id)}
      ListHeaderComponent={header}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={loading ? <ActivityIndicator /> : null}
      ListEmptyComponent={
        loading ? null : (
          <Text
            testID="concordance-status"
            accessibilityRole={failed ? 'alert' : undefined}
            // Without the live region the alert role announces nothing: the
            // node appears after mount, and TalkBack only speaks a subtree it
            // is already watching. Same pairing as SearchScreen and WbwScreen.
            accessibilityLiveRegion={failed ? 'polite' : undefined}
            style={{ color: theme.mutedText, padding: 20, fontSize: typography.body }}
          >
            {t(uiLocale, failed ? 'concordance.loadFailed' : 'concordance.empty')}
          </Text>
        )
      }
      renderItem={renderItem}
      style={{ flex: 1, backgroundColor: theme.background }}
    />
  );
}
