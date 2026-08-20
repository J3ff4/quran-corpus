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
  total: number;
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
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // Refs, not state: onEndReached fires repeatedly while the list settles, and
  // a state read there is a frame behind, which requests the same page twice.
  const busyRef = useRef(false);
  const offsetRef = useRef(0);

  const loadMore = useCallback(async () => {
    if (busyRef.current) return;
    if (offsetRef.current >= total) return;
    busyRef.current = true;
    setLoading(true);
    try {
      const page = await loadPage(offsetRef.current, PAGE);
      offsetRef.current += page.length;
      setEntries((current) => [...current, ...page]);
      // An empty page means the source is exhausted whatever `total` claims;
      // without this the list retries the same tail offset forever.
      if (page.length === 0) offsetRef.current = total;
    } catch (cause) {
      console.error('[concordance] page load failed', { offset: offsetRef.current, cause });
      // Stop paging AND say so. Falling through to the empty state would
      // render a broken read as "this root has no occurrences" (m-5).
      offsetRef.current = total;
      setFailed(true);
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [loadPage, total]);

  useEffect(() => {
    offsetRef.current = 0;
    busyRef.current = false;
    setEntries([]);
    setFailed(false);
    void loadMore();
    // loadMore changes with the loader, which is what a new root or lemma is.
  }, [loadMore]);

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
            style={{ color: theme.mutedText, padding: 20, fontSize: typography.body }}
          >
            {t(uiLocale, failed ? 'concordance.loadFailed' : 'concordance.empty')}
          </Text>
        )
      }
      renderItem={({ item }) => {
        // Same window web shows: the clause around the match, capped, with the
        // flags saying which side was cut.
        const trimmed = trimConcordanceVerse(item.verse_words, item.word_id);
        return (
          <Pressable
            testID="concordance-row"
            accessibilityRole="link"
            // The row's Arabic reads as one long run to TalkBack; the reference
            // and gloss are what identify it. t() has no interpolation.
            accessibilityLabel={`${item.surah_id}:${item.ayah_number}${item.gloss ? `, ${item.gloss}` : ''}`}
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
              {trimmed.truncatedBefore ? '… ' : ''}
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
                    style={word.id === item.word_id ? { color: theme.accent } : undefined}
                  >
                    {word.text_arabic}
                  </Text>
                </Fragment>
              ))}
              {trimmed.truncatedAfter ? ' …' : ''}
            </Text>
          </Pressable>
        );
      }}
      style={{ flex: 1, backgroundColor: theme.background }}
    />
  );
}
