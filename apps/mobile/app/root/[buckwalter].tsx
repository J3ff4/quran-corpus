import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import type { RootEntry } from '@quran-corpus/data/mobile';
import { AdjacentNav } from '@/components/AdjacentNav';
import { ConcordanceList } from '@/components/ConcordanceList';
import { DefinitionCard } from '@/components/DefinitionCard';
import { EntryHeader } from '@/components/EntryHeader';
import { FormFilterChips } from '@/components/FormFilterChips';
import { useGlassSkin } from '@/components/GlassSurface';
import { SlimHeader } from '@/components/SlimHeader';
import {
  getAdjacentRoots,
  getRootOccurrenceCount,
  getRootOccurrences,
  getRootScreen,
} from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { parseRootParam } from '@/data/routeParams';
import { openUserDb } from '@/data/userDb';
import { recordRootView } from '@/data/userRepository';
import { localDay } from '@/home/counters';
import { t } from '@/i18n/uiStrings';
import { useEntryTransition } from '@/motion/useEntryTransition';
import { useAppSettings } from '@/settings/settingsStore';
import { fonts, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

interface Neighbors {
  prev: string | null;
  next: string | null;
}

const NO_NEIGHBORS: Neighbors = { prev: null, next: null };

/** A form filter together with the occurrence count taken for it. The two are
 *  one value because ConcordanceList reads both as list identity: handing it a
 *  filter whose count has not landed yet resets the list twice. */
interface AppliedFilter {
  root: string;
  /** Empty means no filter -- every occurrence of the root. */
  ids: number[];
  total: number;
  /** The count query threw, so `total` is 0 for a reason that is not "none". */
  failed: boolean;
}

/** One root: its Arabic form, hijāʾī-adjacent roots to page between, the
 *  lexicon definitions, and every occurrence in the corpus paging in beneath.
 *  Reached from the reader sheet's root link or from a deep link. */
export default function RootRoute() {
  const params = useLocalSearchParams<{ buckwalter: string }>();
  const theme = useThemeColors();
  const skin = useGlassSkin();
  const { contentLanguage, uiLocale } = useAppSettings();

  // Untrusted: a path segment off a deep link. parseRootParam applies the same
  // charset and length cap the web root page does, and takes the raw
  // useLocalSearchParams value (array and undefined cases included) so the
  // guard lives in one place. useMemo because it feeds an effect dependency.
  const buckwalter = useMemo(() => parseRootParam(params.buckwalter), [params.buckwalter]);

  const [entry, setEntry] = useState<RootEntry | null>(null);
  const [neighbors, setNeighbors] = useState<Neighbors>(NO_NEIGHBORS);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [applied, setApplied] = useState<AppliedFilter | null>(null);

  // Form ids are per-root: an id from one root's forms means a different form
  // on the next root, so carrying the selection across an in-app
  // Previous/Next would filter the new root by a stale id.
  useEffect(() => {
    setSelected([]);
  }, [buckwalter]);

  // Stable string, not the array itself, as the effect dependency below:
  // `selected` only changes identity via setSelected, but deriving a value
  // from it fresh every render (and depending on that) would read as "the
  // filter changed" on every parent render. Matches web's reason for the same
  // guard. Scoped by root as well, because a form id means a different form on
  // the next root.
  const countKey = `${buckwalter ?? ''}|${selected.slice().sort((a, b) => a - b).join(',')}`;

  useEffect(() => {
    let cancelled = false;

    async function loadRoot() {
      // Before the DB is opened, not inside the query: an identifier that is
      // not a root has no business reaching SQLite at all.
      if (!buckwalter) {
        setEntry(null);
        setNeighbors(NO_NEIGHBORS);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const [found, adjacent] = await Promise.all([
          getRootScreen(client, buckwalter),
          getAdjacentRoots(client, buckwalter),
        ]);
        if (!cancelled) {
          setEntry(found);
          setNeighbors(adjacent);
        }
      } catch (cause) {
        // Same dead end as a root the corpus does not carry: nothing the
        // reader can act on either way. Logged for logcat.
        console.error('[root] load failed', { buckwalter, cause });
        if (!cancelled) {
          setEntry(null);
          setNeighbors(NO_NEIGHBORS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRoot();
    return () => {
      cancelled = true;
    };
  }, [buckwalter]);

  // Keyed on the resolved entry, not on `buckwalter`: a deep link to a root the
  // corpus does not carry must not inflate the roots counter with something the
  // reader never saw. `entry.root.id` is the integer root_views is keyed by, so
  // no Buckwalter string -- and no second charset validator -- reaches the
  // write site.
  useEffect(() => {
    if (!entry) return;
    const rootId = entry.root.id;
    void openUserDb()
      .then((db) => recordRootView(createExpoSqliteClient(db as ExpoSqliteLike), rootId, localDay(new Date())))
      // Counted for the Home tab only; nothing on this screen depends on it.
      .catch((cause: unknown) => console.error('[home] root-view write failed', { cause }));
  }, [entry]);

  // Separate from loadRoot: the occurrence count depends on the form filter,
  // which changes far more often than the root itself and must not re-run
  // the whole-page loading gate above (a chip tap must recount, not flash a
  // full-screen spinner over the chips the reader is looking at).
  //
  // It publishes the filter and its count in one state, and nothing below
  // reads `selected` directly. ConcordanceList treats a change in EITHER
  // `total` or `loadPage` as "this is a different list", so applying the new
  // filter the instant a chip is tapped resets the list against the previous
  // filter's total and then resets it again when the count lands -- two page-0
  // queries and a visible flash of rows appearing and vanishing. The chips
  // still show the tap immediately; only the list waits for its own count.
  useEffect(() => {
    if (!buckwalter) {
      setApplied(null);
      return;
    }
    let cancelled = false;
    const ids = selected.slice().sort((a, b) => a - b);
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const count = await getRootOccurrenceCount(
          client,
          buckwalter,
          ids.length > 0 ? ids : undefined,
        );
        if (!cancelled) {
          setApplied({ root: buckwalter, ids, total: count, failed: false });
        }
      } catch (cause) {
        // Same handling as loadRoot: logged for logcat, and the heading falls
        // back to zero rather than keeping a count from the previous filter,
        // which would claim rows the failed query never returned. Unhandled
        // here it would be a bare promise rejection, since nothing awaits it.
        // `failed` travels with it because a zero total alone renders the
        // list's empty state -- "no occurrences" for a root with 1722 (m-5).
        console.error('[root] count failed', { buckwalter, cause });
        if (!cancelled) {
          setApplied({ root: buckwalter, ids, total: 0, failed: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // `selected` is read but not listed: countKey is its stable stand-in, for
    // exactly the reason explained above countKey's declaration.
  }, [buckwalter, countKey]);

  // Above the early returns, as every hook here must be: a render that bails
  // early would otherwise change the hook order.
  const loadPage = useCallback(
    async (offset: number, limit: number) => {
      if (!applied) return [];
      const db = await openCorpusDb();
      const client = createExpoSqliteClient(db as ExpoSqliteLike);
      return getRootOccurrences(
        client,
        applied.root,
        contentLanguage,
        offset,
        limit,
        applied.ids.length > 0 ? applied.ids : undefined,
      );
    },
    // `applied`, not buckwalter + the raw selection: its identity changes once
    // per settled count, in the same commit as the `total` that goes with it.
    // ConcordanceList reads a changed loadPage as "a new list" and resets to
    // page 0, which is what a filter change should do -- once.
    [applied, contentLanguage],
  );

  // D4: the incoming root slides in from the side the reader pressed. Declared
  // with the other hooks, above the early returns -- a render that bails early
  // would otherwise change the hook order.
  //
  // What is drawn, not what was asked for: the two gates below hold the first
  // frame back while three queries run, and a slide keyed on the param alone
  // plays out under the spinner instead of under the root it belongs to.
  const shownRoot = entry && applied?.root === buckwalter ? buckwalter : null;
  const transition = useEntryTransition(shownRoot);

  const toggleForm = useCallback((formId: number) => {
    setSelected((current) =>
      current.includes(formId) ? current.filter((id) => id !== formId) : [...current, formId],
    );
  }, []);

  const spinner = (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );

  if (loading) {
    return spinner;
  }

  if (!entry) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
        <Text accessibilityRole="alert" style={{ color: theme.mutedText, fontSize: typography.body }}>
          {t(uiLocale, 'root.notFound')}
        </Text>
      </View>
    );
  }

  // The entry query is three round trips and the count is one, so the count
  // usually wins -- but not always, and a header rendered before it lands
  // shows the previous root's total over the new root's rows. Both gate the
  // same first frame. A chip tap does NOT come through here: `applied` still
  // holds the previous filter for this same root, so the list stays put
  // instead of flashing a full-screen spinner over the chips.
  if (applied === null || applied.root !== buckwalter) {
    return spinner;
  }

  const { root, definitions, forms } = entry;

  // A plain View, not a ScrollView: this is the concordance list's header, and
  // a scroll view inside a FlatList header is a nested VirtualizedList, which
  // breaks the scroll rather than nesting it.
  const header = (
    <View style={{ gap: 16, paddingBottom: 14 }}>
      {/* D1's slim bar. The stack's own transparent header already draws the
          back arrow above this, so the bar carries the screen's name and the
          Buckwalter spelling and nothing else. */}
      <SlimHeader
        testID="root-header"
        title={t(uiLocale, 'root.heading')}
        caption={root.root_buckwalter}
      />
      <View style={{ paddingHorizontal: 16, gap: 16 }}>
        {/* D5: today's header, kept. Only the chips below took the new look. */}
        <EntryHeader
          uiLocale={uiLocale}
          arabic={root.root_arabic}
          count={root.occurrence_count}
          pager={
            <AdjacentNav
              prev={neighbors.prev}
              next={neighbors.next}
              // replace, not push: paging is a pager, not a trail. Pushing left
              // one screen per Next on a stack the reader can only leave by
              // backing out of every root they passed, and root screens are
              // outside the tab group, so there is no tab bar to escape to
              // either.
              onNavigate={(target, side) => {
              transition.markSide(side);
              router.replace(`/root/${encodeURIComponent(target)}`);
            }}
              label={t(uiLocale, 'root.adjacent')}
              uiLocale={uiLocale}
            />
          }
        >
          {/* One pill per letter, right to left. The spaces in a compound root
              ("ق و ل") are separators, not letters, so they are stripped before
              splitting -- otherwise a three-letter root renders five pills, two
              of them blank. */}
          {/* row-reverse, not a reversed array: the pills stay in tree order
              (ق و ل) so TalkBack reads the root forwards, and only the layout
              flips. Same treatment AlphabetGrid gives the alphabet. */}
          <View
            testID="root-letters"
            style={{
              flexDirection: 'row-reverse',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            {Array.from(root.root_arabic.replace(/\s+/g, '')).map((letter, index) => (
              <View
                key={`${letter}-${index}`}
                testID="root-letter"
                style={{
                  backgroundColor: skin.fill,
                  borderWidth: 1,
                  borderColor: skin.border,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                }}
              >
                <Text style={{ color: theme.text, fontFamily: fonts.arabic, fontSize: typography.body }}>
                  {letter}
                </Text>
              </View>
            ))}
          </View>
        </EntryHeader>

        <View style={{ gap: 10 }}>
          {definitions.length > 0 ? (
            definitions.map((definition) => (
              <DefinitionCard
                key={definition.id}
                uiLocale={uiLocale}
                definition={definition.definition}
                source={definition.source}
              />
            ))
          ) : (
            // 24 roots still carry no definition (hw_gap_24.tsv). Saying so
            // reads clearer than an empty section.
            <Text
              testID="root-no-definition"
              style={{ color: theme.mutedText, fontSize: typography.body }}
            >
              {t(uiLocale, 'root.noDefinition')}
            </Text>
          )}
        </View>

        <FormFilterChips forms={forms} selected={selected} onToggle={toggleForm} uiLocale={uiLocale} />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text
            testID="concordance-heading"
            role="heading"
            style={{
              color: theme.mutedText,
              fontFamily: fonts.displaySemiBold,
              fontSize: typography.caption,
              letterSpacing: 1.2,
              textTransform: 'uppercase',
            }}
          >
            {t(uiLocale, 'concordance.heading')}
          </Text>
          <Text
            testID="concordance-count"
            style={{
              color: theme.mutedText,
              fontSize: typography.caption,
              fontVariant: ['tabular-nums'],
            }}
          >
            {applied.total}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    // The whole screen moves, header and list together, which is what makes it
    // read as a pager rather than as a list that reloaded (D4).
    <Animated.View style={[{ flex: 1 }, transition.style]}>
      <ConcordanceList
        total={applied.total}
        loadPage={loadPage}
        header={header}
        forms={forms}
        countFailed={applied.failed}
      />
    </Animated.View>
  );
}
