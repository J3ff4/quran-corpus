import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import {
  compareRootsArabic,
  foldRootArabic,
  rootFirstLetter,
  type RootSearchItem,
} from '@quran-corpus/data/mobile';
import { AlphabetGrid } from '@/components/AlphabetGrid';
import { DictionaryRow } from '@/components/DictionaryRow';
import { FrequencyList } from '@/components/FrequencyList';
import { GlassSurface, useGlassSkin } from '@/components/GlassSurface';
import { SegmentedControl } from '@/components/SegmentedControl';
import { getAllRootsForBrowse } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { usePressScale } from '@/motion/usePressScale';
import { useAppSettings } from '@/settings/settingsStore';
import { radii, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * One Material filter chip in glass, selected or not.
 *
 * Both chip rows on this screen -- Browse's sort order and the ranked pane's
 * kind -- were the same twenty lines twice, and the pair had already drifted
 * apart once (the sort row lost its toolbar label). Selection is wash AND
 * colour AND weight, never colour alone (§8, WCAG 1.4.1), plus
 * accessibilityState.selected for TalkBack, which sees none of the three.
 *
 * accessibilityRole="button", not "tab": these filter one list. The two
 * segments above are the tabs, and five tabs across two groupings is what
 * TalkBack would otherwise announce.
 */
function FilterChipBase<T extends string>({
  testID,
  value,
  label,
  selected,
  onSelect,
}: {
  testID: string;
  /** Handed back to `onSelect` on press. The pair exists so the parent can pass
   *  one stable callback for the whole row: an `onPress` closure built per
   *  option is a new function on every render, which defeats the memo below and
   *  re-renders every chip -- and a chip is an Animated.View with a shared
   *  value behind it, not a Text. */
  value: T;
  label: string;
  selected: boolean;
  onSelect: (value: T) => void;
}) {
  const theme = useThemeColors();
  const skin = useGlassSkin();
  const press = usePressScale();

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => onSelect(value)}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      style={[
        press.style,
        {
          paddingHorizontal: 15,
          minHeight: touchTargets.compact,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: radii.pill,
          borderWidth: 1,
          // The wash replaces the glass fill rather than layering over it: its
          // measured 4.85:1 assumes it sits directly on the page.
          backgroundColor: selected ? theme.accentWash : skin.fill,
          borderColor: selected ? theme.accent : skin.border,
        },
      ]}
    >
      <Text
        style={{
          color: selected ? theme.accent : theme.mutedText,
          fontSize: typography.caption,
          fontWeight: selected ? '700' : '500',
        }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}

/** Cast back to the generic signature: `memo` erases type parameters, and
 *  without this both chip rows would have to widen `value` to `string`. */
const FilterChip = memo(FilterChipBase) as typeof FilterChipBase;

/**
 * The pane's caption, hung off the right end of its chip row.
 *
 * It had a line of its own under the segmented control and the owner cut it
 * (2026-08-27): a row carrying one short phrase is a row the list could have
 * had. `marginLeft: 'auto'` rather than a spacer, so it stays right-aligned
 * however many chips the row carries.
 *
 * Outside the chip row's own toolbar element on purpose -- inside it, TalkBack
 * would count a caption as one of the controls the toolbar contains.
 */
function PaneCaption({ text }: { text: string }) {
  const theme = useThemeColors();

  return (
    <Text
      testID="dictionary-count"
      numberOfLines={1}
      style={{
        marginLeft: 'auto',
        color: theme.mutedText,
        fontSize: typography.caption,
        // The count changes as the reader types. Proportional digits reflow
        // the line on every keystroke.
        fontVariant: ['tabular-nums'],
      }}
    >
      {text}
    </Text>
  );
}

type Pane = 'browse' | 'frequent';
type DictionarySort = 'alpha' | 'freq';

const NO_ROOTS: RootSearchItem[] = [];

/** A root plus the keys Browse filters on, all folded once at load. `letter`
 *  is its hijāʾī bucket, `folded` its collation-folded Arabic, `bw` and
 *  `gloss` their lower-cased selves. */
interface BrowseRoot extends RootSearchItem {
  letter: string;
  folded: string;
  bw: string;
  gloss: string;
}

const keyOfRoot = (root: BrowseRoot) => root.root_buckwalter;

export function DictionaryScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();
  const [pane, setPane] = useState<Pane>('browse');
  const [kind, setKind] = useState<'roots' | 'lemmas' | 'verbs'>('roots');
  // null while loading; a bare TextInput/list must not read as "no roots" for
  // the tick before the query settles.
  const [roots, setRoots] = useState<RootSearchItem[] | null>(null);
  const [rootsFailed, setRootsFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DictionarySort>('alpha');
  const [letter, setLetter] = useState<string | null>(null);

  // Browse's whole payload, fetched once: search/sort/letter all run over
  // this in JS afterwards (the `visible` memo below), the same split web's
  // static-payload DictionaryBrowser uses.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await getAllRootsForBrowse(client);
        if (!cancelled) setRoots(found);
      } catch (cause) {
        console.error('[dictionary] browse load failed', cause);
        if (!cancelled) {
          setRoots(NO_ROOTS);
          setRootsFailed(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Every root's search and collation keys, folded once when the payload
  // lands rather than on every keystroke. Filtering used to fold all 1642
  // root_arabic strings per character typed, and `foldRootArabic` walks a
  // string a code point at a time -- on Hermes that is the difference between
  // a chip that lights under the thumb and one that lights a beat later.
  const indexed = useMemo<BrowseRoot[]>(
    () =>
      (roots ?? NO_ROOTS).map((root) => ({
        ...root,
        letter: rootFirstLetter(root.root_arabic),
        folded: foldRootArabic(root.root_arabic),
        bw: root.root_buckwalter.toLowerCase(),
        gloss: root.gloss_blob?.toLowerCase() ?? '',
      })),
    [roots],
  );

  // Both orders, sorted once. Sorting per keystroke was the screen's single
  // most expensive act: 1642 roots is ~17k comparisons and compareRootsArabic
  // allocates two key arrays for each one. A filter preserves the order of
  // what it keeps, so ordering the whole corpus twice up front is all either
  // chip ever needs.
  const ordered = useMemo(() => {
    const alpha = [...indexed].sort((a, b) => compareRootsArabic(a.root_arabic, b.root_arabic));
    // Sorted FROM alpha, not from scratch: Array.sort is stable (ES2019, and
    // Hermes complies), so equal counts keep the hijāʾī order they arrive in.
    // That is the same result the old two-clause comparator produced, without
    // running compareRootsArabic on the frequency path at all.
    const freq = [...alpha].sort((a, b) => b.occurrence_count - a.occurrence_count);
    return { alpha, freq };
  }, [indexed]);

  // Which letters have any root at all, folded out of the list already in
  // hand rather than fetched: both came from the same 1642-row GROUP_CONCAT
  // join, so a second query paid for it twice and shipped two copies of the
  // payload over the bridge. Derived state also cannot disagree with the list
  // Browse filters -- the grid enables exactly the cells `visible` can produce,
  // because both fold with the same rootFirstLetter. Empty until the list
  // lands, so every cell renders disabled rather than flashing an all-enabled
  // alphabet that then dims.
  const available = useMemo(() => new Set(indexed.map((root) => root.letter)), [indexed]);

  // One flag, one derivation: the grid is not worth the screen it takes while a
  // query is running (the results sat below the fold until the keyboard was
  // dismissed), and intersecting a query with a letter the reader can no longer
  // see filters invisibly. The letter is bypassed, not cleared, so emptying the
  // box puts the reader back where they were.
  const searching = query.trim().length > 0;

  // A filter over an already-ordered array, and nothing else: no sort, no
  // folding, no allocation beyond the result itself.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = sort === 'freq' ? ordered.freq : ordered.alpha;
    if (q) {
      // The Arabic arm folds the needle to match the folded haystack (hamza
      // seat + inter-letter spaces), so `ارض` finds the stored `أرض` -- the
      // same normalization searchRoots uses. The Latin arms stay raw:
      // foldRootArabic('ktb') === 'ktb', and a folded Latin needle never
      // occurs inside an Arabic haystack.
      const qf = foldRootArabic(q);
      return list.filter(
        (root) => root.folded.includes(qf) || root.bw.includes(q) || root.gloss.includes(q),
      );
    }
    if (letter) return list.filter((root) => root.letter === letter);
    return list;
  }, [ordered, query, sort, letter]);

  const setSortAndClearLetter = useCallback((next: DictionarySort) => {
    // Matches web: switching sort clears the letter, so the list the reader
    // sees is the whole corpus ordered by frequency, not one letter of it.
    setSort(next);
    setLetter(null);
  }, []);

  // Stable, so AlphabetGrid's 29 cells and the list's rows are not handed a
  // new callback -- and re-rendered -- every time any of this screen's state
  // changes.
  const selectLetter = useCallback((picked: string) => {
    setLetter((prev) => (prev === picked ? null : picked));
  }, []);

  const renderRow = useCallback(
    ({ item }: { item: BrowseRoot }) => (
      <DictionaryRow
        uiLocale={uiLocale}
        arabic={item.root_arabic}
        translit={item.root_buckwalter}
        count={item.occurrence_count}
        href={`/root/${encodeURIComponent(item.root_buckwalter)}`}
      />
    ),
    [uiLocale],
  );

  const paneOptions = useMemo(
    () =>
      [
        { value: 'browse', label: t(uiLocale, 'dictionary.browse') },
        { value: 'frequent', label: t(uiLocale, 'dictionary.frequent') },
      ] as const,
    [uiLocale],
  );

  return (
    <View style={{ flex: 1 }}>
      {/* No slim bar: the owner cut it on 2026-08-27, and the tab bar already
          names this screen. Its caption stayed -- it counts what is on screen,
          so it follows the letter filter and the search box rather than
          reporting a corpus total the list disagrees with -- but it no longer
          takes a line of its own: each pane hangs it off the right end of its
          own chip row (owner, 2026-08-27). */}
      <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 }}>
        <SegmentedControl
          options={paneOptions}
          value={pane}
          onChange={setPane}
          accessibilityLabel={t(uiLocale, 'tabs.dictionary')}
        />
      </View>

      {pane === 'browse' ? (
        <>
          {/* A TextInput inside a FlatList's ListHeaderComponent loses focus on
              every keystroke -- the header element is a new instance each
              render, so the input remounts. This has to be a sibling of the
              list, not inside it. */}
          <View style={{ paddingHorizontal: 16 }}>
            {/* The glass sits on the row, not on the input, so the clear button
                reads as being inside the field. clearButtonMode is not an
                option -- it is iOS-only and this app ships Android first. */}
            <GlassSurface
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingRight: 4,
              }}
            >
              <TextInput
                testID="dictionary-search"
                value={query}
                onChangeText={setQuery}
                placeholder={t(uiLocale, 'dictionary.searchPlaceholder')}
                placeholderTextColor={theme.mutedText}
                accessibilityLabel={t(uiLocale, 'dictionary.searchLabel')}
                style={{
                  flex: 1,
                  color: theme.text,
                  paddingHorizontal: 14,
                  minHeight: touchTargets.minimum,
                }}
              />
              {query.length > 0 ? (
                <Pressable
                  testID="dictionary-search-clear"
                  accessibilityRole="button"
                  accessibilityLabel={t(uiLocale, 'dictionary.clearSearch')}
                  onPress={() => setQuery('')}
                  // A bare ✕ glyph is a ~14pt target; the minimums are what
                  // keep it above the 48dp floor the rest of the app holds to.
                  style={{
                    minHeight: touchTargets.minimum,
                    minWidth: touchTargets.minimum,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: theme.mutedText, fontSize: typography.body }}>✕</Text>
                </Pressable>
              ) : null}
            </GlassSurface>
          </View>

          {rootsFailed ? (
            <View style={{ padding: 20 }}>
              <Text accessibilityRole="alert" style={{ color: theme.mutedText, fontSize: typography.body }}>
                {t(uiLocale, 'dictionary.loadFailed')}
              </Text>
            </View>
          ) : (
            <FlatList
              testID="dictionary-list"
              data={visible}
              keyExtractor={keyOfRoot}
              // Otherwise Android's default ("never") reads the first tap on a
              // row -- with the keyboard open from the search box above -- as
              // "dismiss the keyboard" rather than as a press on that row.
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                <>
                  {searching ? null : (
                    <AlphabetGrid
                      uiLocale={uiLocale}
                      available={available}
                      activeLetter={letter}
                      onSelect={selectLetter}
                    />
                  )}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      gap: 8,
                    }}
                  >
                    <View
                      accessibilityRole="toolbar"
                      accessibilityLabel={t(uiLocale, 'dictionary.sortFilter')}
                      style={{ flexDirection: 'row', gap: 8 }}
                    >
                      {(['alpha', 'freq'] as const).map((option) => (
                        <FilterChip
                          key={option}
                          value={option}
                          testID={`dictionary-sort-${option}`}
                          label={t(
                            uiLocale,
                            option === 'alpha' ? 'dictionary.sortAlpha' : 'dictionary.sortFreq',
                          )}
                          selected={sort === option}
                          onSelect={setSortAndClearLetter}
                        />
                      ))}
                    </View>
                    {/* Label first, count second, the way Home's counters read.
                        The mockup's "1,642 roots" would be "1 roots" the moment
                        a search isolates one -- and "1 корней" in Russian,
                        which is wrong for three of its four count classes. No
                        locale has to agree with a number in this order, and it
                        reuses a string that already exists. */}
                    <PaneCaption
                      text={`${t(uiLocale, 'dictionary.kindRoots')} · ${visible.length}`}
                    />
                  </View>
                </>
              }
              ListEmptyComponent={
                // getAllRootsForBrowse is a 1642-row GROUP_CONCAT join, so the
                // gap before it settles is real. `roots` is null for exactly
                // that stretch, and "No roots found" over an empty corpus reads
                // as a broken build rather than as a list on its way.
                roots === null ? (
                  <View style={{ padding: 20 }}>
                    <ActivityIndicator />
                  </View>
                ) : (
                  <View style={{ padding: 20 }}>
                    <Text testID="dictionary-empty" style={{ color: theme.mutedText }}>
                      {t(uiLocale, 'dictionary.noRootsFound')}
                    </Text>
                  </View>
                )
              }
              renderItem={renderRow}
              style={{ flex: 1 }}
              // The rows carry their own side margins and the gap between
              // them, because FrequencyList renders the same card and neither
              // list should have to know the other's spacing.
              contentContainerStyle={{ paddingTop: 4, paddingBottom }}
            />
          )}
        </>
      ) : null}
      {pane === 'frequent' ? (
        <>
          {/* Three sibling chips with nothing saying they filter the list
              below, the same gap AlphabetGrid names its container for.
              toolbar, not radiogroup: the chips are Material filter chips --
              buttons carrying a selected state, per Android convention -- and
              radiogroup would claim radio children they deliberately are not.
              The toolbar is the inner View, so the caption beside it is not
              counted as one of the controls it holds. */}
          <View
            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }}
          >
            <View
              accessibilityRole="toolbar"
              accessibilityLabel={t(uiLocale, 'dictionary.kindFilter')}
              style={{ flexDirection: 'row', gap: 8 }}
            >
              {(['roots', 'lemmas', 'verbs'] as const).map((option) => (
                <FilterChip
                  key={option}
                  value={option}
                  testID={`frequency-kind-${option}`}
                  label={t(
                    uiLocale,
                    option === 'roots'
                      ? 'dictionary.kindRoots'
                      : option === 'lemmas'
                        ? 'dictionary.kindLemmas'
                        : 'dictionary.kindVerbs',
                  )}
                  selected={kind === option}
                  onSelect={setKind}
                />
              ))}
            </View>
            <PaneCaption text={t(uiLocale, 'dictionary.sortFreq')} />
          </View>
          <FrequencyList kind={kind} />
        </>
      ) : null}
    </View>
  );
}
