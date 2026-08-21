import { Fragment, useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { trimConcordanceVerse, type ConcordanceEntry, type RootForm } from '@quran-corpus/data/mobile';
import { t } from '@/i18n/uiStrings';
import type { UiLocaleCode } from '@/i18n/languages';
import { useAppSettings } from '@/settings/settingsStore';
import { formColorFor } from '@/theme/formTint';
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
  /** Derived forms to tag occurrences with, by `form_id`. Optional by design:
   *  the lemma screen has no derived forms to pass, and an entry whose
   *  `form_id` cannot be resolved (undefined here, or absent from the list)
   *  renders no tag rather than a raw id. */
  forms?: RootForm[];
  /** The caller's own occurrence count failed, so `total` is 0 for a reason
   *  that is not "there are none". Without it the list renders its empty state
   *  and a root with 1722 occurrences reads as having none (m-5). */
  countFailed?: boolean;
}

function ConcordanceRow({
  item,
  forms,
  uiLocale,
}: {
  item: ConcordanceEntry;
  forms: RootForm[] | undefined;
  uiLocale: UiLocaleCode;
}) {
  const theme = useThemeColors();
  // Per-row, not lifted: each row's expansion is independent, and this only
  // works because the row is its own component -- a renderItem closure can't
  // hold hook state across FlatList's re-renders.
  const [expanded, setExpanded] = useState(false);

  // Same window web shows: the clause around the match, capped, with the
  // flags saying which side was cut.
  const trimmed = trimConcordanceVerse(item.verse_words, item.word_id);
  const shown = expanded ? item.verse_words : trimmed.words;
  // Only when the trim really cut something: a short ayah must not carry a
  // control that does nothing.
  const canExpand = trimmed.words.length < item.verse_words.length;
  const form = item.form_id === null ? undefined : forms?.find((f) => f.id === item.form_id);
  const formStyle = form ? formColorFor(theme, form.pos_label) : null;

  return (
    <View style={{ paddingHorizontal: 20, paddingVertical: 12, gap: 4 }}>
      <Pressable
        testID="concordance-row"
        accessibilityRole="link"
        // Pressable is one accessibility node, so this label replaces the
        // subtree's text rather than adding to it -- the verse has to be in
        // here or it is unreachable without opening every row. Reference and
        // gloss lead because they identify the row; the Arabic reads as one
        // long run and belongs last. t() has no interpolation. Transliteration
        // and the form tag are left out: both are already visible text next to
        // the Arabic they annotate, and a longer label buys nothing here.
        accessibilityLabel={`${item.surah_id}:${item.ayah_number}:${item.position}${item.gloss ? `, ${item.gloss}` : ''}, ${shown.map((word) => word.text_arabic).join(' ')}`}
        onPress={() => router.push(`/surah/${item.surah_id}?ayah=${item.ayah_number}`)}
        style={{ gap: 4, minHeight: touchTargets.minimum }}
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
          <View
            // Word, form tag and transliteration travel together at the start
            // edge -- they all describe the same occurrence -- leaving the
            // 3-part reference alone at the end.
            style={{ flexDirection: 'row-reverse', alignItems: 'baseline', gap: 6, flexShrink: 1 }}
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
            {form && formStyle ? (
              <View
                testID="concordance-form"
                style={{
                  backgroundColor: formStyle.tint,
                  borderRadius: 999,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                }}
              >
                {/* form_translit is the readable name of the form; pos_label is
                    the fallback for the ~none that lack one. */}
                <Text style={{ color: formStyle.color, fontSize: typography.caption, fontWeight: '600' }}>
                  {form.form_translit ?? form.pos_label}
                </Text>
              </View>
            ) : null}
            {item.transliteration ? (
              <Text testID="concordance-translit" style={{ color: theme.mutedText, fontSize: typography.caption }}>
                {item.transliteration}
              </Text>
            ) : null}
          </View>
          <Text testID="concordance-ref" style={{ color: theme.mutedText, fontSize: typography.caption }}>
            {item.surah_id}:{item.ayah_number}:{item.position}
          </Text>
        </View>

        {item.gloss ? (
          <Text testID="concordance-gloss" style={{ color: theme.mutedText, fontSize: typography.caption }}>
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
              are not part of the verse and must not read as its words. Hidden
              once expanded -- the whole verse is showing, there is nothing
              left to mark as cut. */}
          {trimmed.truncatedBefore && !expanded ? <Text style={{ color: theme.border }}>… </Text> : ''}
          {shown.map((word, index) => (
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
                // Three signals, because one is not enough for either
                // standard. Hue alone is 1.26:1 light / 1.15:1 dark against
                // the surrounding muted text, so the match is unfindable
                // with a colour-vision deficiency (1.4.11); wash and tint
                // are both still colour, so WCAG 1.4.1 needs a signal that
                // is not (weight).
                //
                // Weight matches web's `font-semibold` exactly: both
                // products load the same single-weight hafs.18.woff2 with no
                // bold face, so web's signal is the browser synthesising one
                // and this is Android doing the same. No underline -- it
                // collides with the sub-baseline diacritics.
                style={
                  word.id === item.word_id
                    ? {
                        color: theme.accent,
                        backgroundColor: theme.accentWash,
                        fontWeight: '700',
                      }
                    : undefined
                }
              >
                {word.text_arabic}
              </Text>
            </Fragment>
          ))}
          {trimmed.truncatedAfter && !expanded ? <Text style={{ color: theme.border }}> …</Text> : ''}
        </Text>
      </Pressable>

      {/* Outside the Pressable above, deliberately: the row is one
          accessibility node whose label replaces its subtree, so a nested
          toggle announces as nothing -- and a press target inside a press
          target is ambiguous on Android. */}
      {canExpand ? (
        <Pressable
          testID="concordance-expand"
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((value) => !value)}
          style={{ minHeight: touchTargets.compact, justifyContent: 'center', alignSelf: 'flex-start' }}
        >
          <Text style={{ color: theme.accent, fontSize: typography.caption }}>
            {t(uiLocale, expanded ? 'text.showLess' : 'concordance.showFullVerse')}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Paged occurrences under a screen's own header. Shared by the root and lemma
 *  screens, which differ only in header, loader and (root only) forms.
 *
 *  Rows are Pressable, not Link: expo-router's Link renders a Text on native,
 *  and the row is a two-line layout whose Views would not lay out inside one. */
export function ConcordanceList({
  total,
  loadPage,
  header,
  forms,
  countFailed = false,
}: ConcordanceListProps) {
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
    ({ item }: { item: ConcordanceEntry }) => (
      <ConcordanceRow item={item} forms={forms} uiLocale={uiLocale} />
    ),
    [forms, uiLocale],
  );

  // One node, two slots. An empty list renders it as the empty state; a list
  // that loaded some pages and then broke renders it under the last row, where
  // the reader is looking. It cannot appear in both at once -- the footer branch
  // requires rows and ListEmptyComponent renders only without them.
  // Either half is a broken read, and both render the same sentence: a page
  // that threw, or a total that never arrived.
  const broken = failed || countFailed;
  const status = (
    <Text
      testID="concordance-status"
      accessibilityRole={broken ? 'alert' : undefined}
      // Without the live region the alert role announces nothing: the
      // node appears after mount, and TalkBack only speaks a subtree it
      // is already watching. Same pairing as SearchScreen and WbwScreen.
      accessibilityLiveRegion={broken ? 'polite' : undefined}
      style={{ color: theme.mutedText, padding: 20, fontSize: typography.body }}
    >
      {t(uiLocale, broken ? 'concordance.loadFailed' : 'concordance.empty')}
    </Text>
  );

  return (
    <FlatList
      data={entries}
      keyExtractor={(item) => String(item.word_id)}
      ListHeaderComponent={header}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      // A page that fails after the first one leaves the rest of the root
      // unreachable -- paging is stopped for good (offsetRef is pinned to
      // total). Without this the list just stops growing, which is
      // indistinguishable from having reached the end (m-5, second half).
      ListFooterComponent={
        loading ? <ActivityIndicator /> : failed && entries.length > 0 ? status : null
      }
      ListEmptyComponent={loading ? null : status}
      renderItem={renderItem}
      style={{ flex: 1, backgroundColor: theme.background }}
    />
  );
}
