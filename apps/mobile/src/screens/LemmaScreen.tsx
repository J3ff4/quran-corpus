import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { Link } from 'expo-router';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import {
  posBucket,
  type LemmaEntry,
  type LemmaFrequencyKind,
} from '@quran-corpus/data/mobile';
import { AdjacentNav } from '@/components/AdjacentNav';
import { ConcordanceList } from '@/components/ConcordanceList';
import { DefinitionCard } from '@/components/DefinitionCard';
import { EntryHeader } from '@/components/EntryHeader';
import { useGlassSkin } from '@/components/GlassSurface';
import { InfoButton, InfoSheet } from '@/components/InfoSheet';
import { getAdjacentLemmas, getLemmaOccurrences, getLemmaScreen } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useEntryPager, useHeldEntry } from '@/motion/entryPager';
import { useAppSettings } from '@/settings/settingsStore';
import { fonts, radii, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

interface Neighbors {
  prev: string | null;
  next: string | null;
}

/** Module scope: a fresh literal inside the effect would be a new identity on
 *  every run. */
const NO_NEIGHBORS: Neighbors = { prev: null, next: null };

/** Neighbours together with the lemma they were taken for. Keyed rather than
 *  cleared on every change: the pager keeps the previous lemma on screen while
 *  the next one loads, and clearing would dim that lemma's own arrows for the
 *  whole of the wait. A key that does not match whatever is drawn reads as
 *  "not known yet", which is the same dimmed state a deep link with no ranking
 *  already shows. */
interface KeyedNeighbors {
  key: string | null;
  value: Neighbors;
}

const NO_KEYED_NEIGHBORS: KeyedNeighbors = { key: null, value: NO_NEIGHBORS };

/** One lemma, drawn only once its query has settled. A bundle rather than the
 *  screen's own state, because the pager holds the previous one on screen
 *  while the next loads (`useHeldEntry`): the body has to render from a
 *  consistent set, not from whatever each `useState` holds mid-flight. */
interface LemmaView {
  key: string;
  /** null is a lemma the corpus does not carry -- a settled answer, not a
   *  pending one. */
  entry: LemmaEntry | null;
  total: number;
}

export interface LemmaScreenProps {
  /** Already validated by the route. `null` is an identifier that is not a
   *  lemma, which renders the not-found state without touching the DB. */
  lemmaBuckwalter: string | null;
  /** Which Most-used ranking Previous/Next walks, already validated by the
   *  route. `null` is a deep link that named no ranking (or named one that is
   *  not a ranking), which renders both arrows dimmed rather than guessing. */
  source: LemmaFrequencyKind | null;
}

/** One lemma: its Arabic form and reading, the grammatical senses it is
 *  tagged with, the commonest word-by-word glosses (behind an info button
 *  explaining they are translations, not definitions), its root's own
 *  lexicon definition, and every occurrence in the corpus paging in beneath.
 *  Reached from a dictionary Frequent-pane row (lemma or verb) or a deep
 *  link. A verb page reached from Frequent is a destination, not a waypoint:
 *  full parity with web's lemma page, not deferred to the root screen this
 *  links to. */
export function LemmaScreen({ lemmaBuckwalter, source }: LemmaScreenProps) {
  const { uiLocale, contentLanguage } = useAppSettings();
  const theme = useThemeColors();
  const skin = useGlassSkin();

  // Previous/Next changes this, not the route. See useEntryPager for why
  // paging stopped going through the router.
  const { current: lemmaKey, goTo, animation } = useEntryPager(lemmaBuckwalter);

  const [loaded, setLoaded] = useState<LemmaView | null>(null);
  const [neighbors, setNeighbors] = useState<KeyedNeighbors>(NO_KEYED_NEIGHBORS);
  // Owned here, not by InfoSheet: BottomSheet fills its parent, and the button
  // that opens it lives in the FlatList header. See InfoButton's docstring.
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (lemmaKey === null) {
      setLoaded(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await getLemmaScreen(client, lemmaKey, contentLanguage);
        if (!cancelled) setLoaded({ key: lemmaKey, entry: found.entry, total: found.total });
      } catch (cause) {
        // Same dead end as a lemma the corpus does not carry. Logged for logcat.
        console.error('[lemma] load failed', { lemmaBuckwalter: lemmaKey, cause });
        if (!cancelled) setLoaded({ key: lemmaKey, entry: null, total: 0 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lemmaKey, contentLanguage]);

  useEffect(() => {
    if (lemmaKey === null || source === null) {
      setNeighbors(NO_KEYED_NEIGHBORS);
      return;
    }

    // Not cleared before the refetch: the answer carries the lemma it belongs
    // to, and the body dims the arrows itself when that does not match what is
    // drawn. Clearing here would instead dim the *previous* lemma's arrows for
    // as long as the next one takes to load -- and the verb aggregate is the
    // slowest query on this screen.
    let cancelled = false;
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const adjacent = await getAdjacentLemmas(client, lemmaKey, source);
        if (!cancelled) setNeighbors({ key: lemmaKey, value: adjacent });
      } catch (cause) {
        // Dimmed arrows, not a broken screen: paging is a convenience and the
        // entry itself has already loaded. Logged for logcat.
        console.error('[lemma] neighbours failed', { lemmaBuckwalter: lemmaKey, source, cause });
        if (!cancelled) setNeighbors(NO_KEYED_NEIGHBORS);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lemmaKey, source]);

  const loadPage = useCallback(
    async (offset: number, limit: number) => {
      if (lemmaKey === null) return [];
      const db = await openCorpusDb();
      const client = createExpoSqliteClient(db as ExpoSqliteLike);
      return getLemmaOccurrences(client, lemmaKey, contentLanguage, offset, limit);
    },
    [lemmaKey, contentLanguage],
  );

  // What the reader sees: the previous lemma stays until its replacement is
  // ready, which is what the outgoing half of the page turn animates. Declared
  // with the other hooks, above the early returns -- a render that bails early
  // would otherwise change the hook order.
  const view = useHeldEntry(loaded && loaded.key === lemmaKey ? loaded : null);

  const notFound = (
    <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
      <Text accessibilityRole="alert" style={{ color: theme.mutedText, fontSize: typography.body }}>
        {t(uiLocale, 'lemma.notFound')}
      </Text>
    </View>
  );

  if (lemmaKey === null) return notFound;

  if (!view) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!view.entry) return notFound;

  // Named locally so the body below reads from one settled bundle rather than
  // from three pieces of state that change at three different moments.
  const { entry, total } = view;
  const arrows = neighbors.key === view.key ? neighbors.value : NO_NEIGHBORS;

  // One style for every section label on this screen, so they cannot drift
  // apart the way the two chip rows in DictionaryScreen did.
  const eyebrow = {
    color: theme.mutedText,
    fontFamily: fonts.displaySemiBold,
    fontSize: typography.caption,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  } as const;

  // Plain Views, no ScrollView: this is a FlatList header, and a scroll view
  // inside one is a nested VirtualizedList (see ConcordanceList, R2).
  const header = (
    <View style={{ gap: 16, paddingBottom: 14 }}>
      {/* No slim bar: the owner cut it on 2026-08-27. Its caption was the
          transliteration, which EntryHeader already draws under the headword,
          so nothing moved and nothing was lost. */}
      <View style={{ paddingTop: 8, paddingHorizontal: 16, gap: 16 }}>
        <EntryHeader
          uiLocale={uiLocale}
          arabic={entry.lemma}
          transliteration={entry.transliteration}
          count={entry.count}
          pager={
            <AdjacentNav
              prev={arrows.prev}
              next={arrows.next}
              // Paging is a pager, not a trail: it changes what this screen
              // shows and never touches the navigator. See useEntryPager.
              onNavigate={goTo}
              label={t(uiLocale, 'lemma.adjacent')}
              uiLocale={uiLocale}
              testIDPrefix="lemma"
            />
          }
        >
          {entry.senses.length > 0
            ? entry.senses.map((sense) => {
                const bucket = posBucket(sense.pos_tag);
                return (
                  <View
                    key={sense.pos_tag}
                    testID="sense-chip"
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 5,
                      paddingHorizontal: 9,
                      paddingVertical: 4,
                      borderRadius: radii.chip,
                      borderWidth: 1,
                      backgroundColor: skin.fill,
                      borderColor: skin.border,
                    }}
                  >
                    {/* The colour rides on a dot, not the label: these run in a
                        dense row and a repeated tint reads as noise at this
                        size. Meaning never rides on colour either way -- the
                        label carries it. posBucket returns null for DET, which
                        renders no dot rather than an arbitrary colour. */}
                    {bucket ? (
                      <View
                        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.pos[bucket] }}
                      />
                    ) : null}
                    <Text style={{ color: theme.text, fontSize: typography.caption }}>{sense.pos_label}</Text>
                    {/* Count only when there is more than one sense: with a
                        single sense it duplicates the occurrence line directly
                        above (entry-count on EntryHeader). */}
                    {entry.senses.length > 1 ? (
                      <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>{sense.count}</Text>
                    ) : null}
                  </View>
                );
              })
            : null}
        </EntryHeader>

        {entry.top_glosses.length > 0 ? (
          <View style={{ gap: 4 }}>
            {/* Contextual word-by-word translations, not definitions -- the
                commonest gloss for a word can be a whole clause. Unlabelled
                these read as the lemma's meaning; see LemmaEntry.top_glosses.
                The full caveat lives behind the info button rather than in
                permanent body text -- see InfoSheet's own docstring. */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={eyebrow}>{t(uiLocale, 'lemma.translatedAs')}</Text>
              <InfoButton
                label={t(uiLocale, 'lemma.aboutTranslations')}
                expanded={infoOpen}
                onPress={() => setInfoOpen(true)}
              />
            </View>
            <Text style={{ color: theme.text, fontSize: typography.body }}>
              {entry.top_glosses.join(' · ')}
            </Text>
          </View>
        ) : null}

        {entry.root_buckwalter ? (
          <View style={{ gap: 10 }}>
            <Text style={eyebrow}>{t(uiLocale, 'lemma.rootDefinition')}</Text>
            {entry.root_definition ? (
              <DefinitionCard
                uiLocale={uiLocale}
                definition={entry.root_definition}
                source={entry.root_definition_source}
              />
            ) : (
              // Same wording as the root screen's own empty state (24 roots
              // still carry no definition): saying so reads clearer than an
              // empty section.
              <Text
                testID="lemma-no-definition"
                style={{ color: theme.mutedText, fontSize: typography.body }}
              >
                {t(uiLocale, 'root.noDefinition')}
              </Text>
            )}
            <Link
              testID="lemma-root"
              href={`/root/${encodeURIComponent(entry.root_buckwalter)}`}
              accessibilityRole="link"
              style={{ color: theme.accent, paddingVertical: 12, minHeight: touchTargets.minimum }}
            >
              {t(uiLocale, 'lemma.viewRoot')}
            </Link>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Text testID="concordance-heading" role="heading" style={eyebrow}>
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
            {total}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* accessibilityViewIsModal is iOS-only, so on Android this is what stops
          TalkBack swiping into the list behind the sheet -- same pairing as
          WbwScreen. */}
      <View
        testID="lemma-content"
        style={{ flex: 1 }}
        importantForAccessibility={infoOpen ? 'no-hide-descendants' : 'auto'}
      >
        {/* The whole screen moves, header and list together, which is what
            makes it read as a pager rather than as a list that reloaded.
            Inside the a11y wrapper, not around it: the sheet's
            no-hide-descendants has to keep covering the list.

            absoluteFill, not flex: reanimated keeps the outgoing lemma in the
            native hierarchy until its exit finishes, and in a flex column that
            second child would halve both their heights for the length of the
            animation. */}
        <Animated.View
          key={view.key}
          entering={animation.entering}
          exiting={animation.exiting}
          style={StyleSheet.absoluteFill}
        >
          <ConcordanceList total={total} loadPage={loadPage} header={header} />
        </Animated.View>
      </View>
      {infoOpen ? (
        <InfoSheet
          uiLocale={uiLocale}
          label={t(uiLocale, 'lemma.aboutTranslations')}
          body={t(uiLocale, 'lemma.translationsNote')}
          onClose={() => setInfoOpen(false)}
        />
      ) : null}
    </View>
  );
}
