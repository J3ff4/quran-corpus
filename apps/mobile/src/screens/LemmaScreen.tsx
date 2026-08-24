import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Link, router } from 'expo-router';
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
import { InfoButton, InfoSheet } from '@/components/InfoSheet';
import { getAdjacentLemmas, getLemmaOccurrences, getLemmaScreen } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

interface Neighbors {
  prev: string | null;
  next: string | null;
}

/** Module scope: a fresh literal inside the effect would be a new identity on
 *  every run. */
const NO_NEIGHBORS: Neighbors = { prev: null, next: null };

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

  const [entry, setEntry] = useState<LemmaEntry | null>(null);
  const [neighbors, setNeighbors] = useState<Neighbors>(NO_NEIGHBORS);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(lemmaBuckwalter !== null);
  // Owned here, not by InfoSheet: BottomSheet fills its parent, and the button
  // that opens it lives in the FlatList header. See InfoButton's docstring.
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    if (lemmaBuckwalter === null) {
      setEntry(null);
      setTotal(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await getLemmaScreen(client, lemmaBuckwalter, contentLanguage);
        if (cancelled) return;
        setEntry(found.entry);
        setTotal(found.total);
      } catch (cause) {
        // Same dead end as a lemma the corpus does not carry. Logged for logcat.
        console.error('[lemma] load failed', { lemmaBuckwalter, cause });
        if (!cancelled) {
          setEntry(null);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lemmaBuckwalter, contentLanguage]);

  useEffect(() => {
    if (lemmaBuckwalter === null || source === null) {
      setNeighbors(NO_NEIGHBORS);
      return;
    }

    // Cleared before the refetch, not left holding the last lemma's answer: if
    // the route's params change in place the verb aggregate is the slowest
    // query here, and stale arrows would page somewhere the reader never was.
    // Dimmed for that window is the same state a deep link with no ranking
    // shows, which the reader already understands.
    setNeighbors(NO_NEIGHBORS);

    let cancelled = false;
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const adjacent = await getAdjacentLemmas(client, lemmaBuckwalter, source);
        if (!cancelled) setNeighbors(adjacent);
      } catch (cause) {
        // Dimmed arrows, not a broken screen: paging is a convenience and the
        // entry itself has already loaded. Logged for logcat.
        console.error('[lemma] neighbours failed', { lemmaBuckwalter, source, cause });
        if (!cancelled) setNeighbors(NO_NEIGHBORS);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [lemmaBuckwalter, source]);

  const loadPage = useCallback(
    async (offset: number, limit: number) => {
      if (lemmaBuckwalter === null) return [];
      const db = await openCorpusDb();
      const client = createExpoSqliteClient(db as ExpoSqliteLike);
      return getLemmaOccurrences(client, lemmaBuckwalter, contentLanguage, offset, limit);
    },
    [lemmaBuckwalter, contentLanguage],
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: theme.background }}>
        <Text accessibilityRole="alert" style={{ color: theme.mutedText, fontSize: typography.body }}>
          {t(uiLocale, 'lemma.notFound')}
        </Text>
      </View>
    );
  }

  // Plain Views, no ScrollView: this is a FlatList header, and a scroll view
  // inside one is a nested VirtualizedList (see ConcordanceList, R2).
  const header = (
    <View style={{ padding: 20, gap: 18 }}>
      <EntryHeader
        uiLocale={uiLocale}
        arabic={entry.lemma}
        transliteration={entry.transliteration}
        count={entry.count}
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
                    gap: 4,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: theme.border,
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

      <AdjacentNav
        prev={neighbors.prev}
        next={neighbors.next}
        // Guarded rather than assumed non-null: a null source yields no
        // neighbours, so this cannot fire -- but a future caller that changes
        // that must not be able to emit the string '?from=null'.
        onNavigate={
          source
            ? (target) => router.replace(`/lemma/${encodeURIComponent(target)}?from=${source}`)
            : () => {}
        }
        label={t(uiLocale, 'lemma.adjacent')}
        uiLocale={uiLocale}
        testIDPrefix="lemma"
      />

      {entry.top_glosses.length > 0 ? (
        <View style={{ gap: 4 }}>
          {/* Contextual word-by-word translations, not definitions -- the
              commonest gloss for a word can be a whole clause. Unlabelled
              these read as the lemma's meaning; see LemmaEntry.top_glosses.
              The full caveat lives behind the info button rather than in
              permanent body text -- see InfoSheet's own docstring. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
              {t(uiLocale, 'lemma.translatedAs')}
            </Text>
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
          <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
            {t(uiLocale, 'lemma.rootDefinition')}
          </Text>
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

      <Text
        testID="concordance-heading"
        role="heading"
        style={{ color: theme.mutedText, fontSize: typography.caption }}
      >
        {t(uiLocale, 'concordance.heading')} ({total})
      </Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* accessibilityViewIsModal is iOS-only, so on Android this is what stops
          TalkBack swiping into the list behind the sheet -- same pairing as
          WbwScreen. */}
      <View style={{ flex: 1 }} importantForAccessibility={infoOpen ? 'no-hide-descendants' : 'auto'}>
        <ConcordanceList total={total} loadPage={loadPage} header={header} />
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
