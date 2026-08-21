import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import type { RootEntry } from '@quran-corpus/data/mobile';
import { ConcordanceList } from '@/components/ConcordanceList';
import { DefinitionCard } from '@/components/DefinitionCard';
import { EntryHeader } from '@/components/EntryHeader';
import {
  getAdjacentRoots,
  getRootOccurrenceCount,
  getRootOccurrences,
  getRootScreen,
} from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { parseRootParam } from '@/data/routeParams';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

interface Neighbors {
  prev: string | null;
  next: string | null;
}

const NO_NEIGHBORS: Neighbors = { prev: null, next: null };

/** One root: its Arabic form, hijāʾī-adjacent roots to page between, the
 *  lexicon definitions, and every occurrence in the corpus paging in beneath.
 *  Reached from the reader sheet's root link or from a deep link. */
export default function RootRoute() {
  const params = useLocalSearchParams<{ buckwalter: string }>();
  const theme = useThemeColors();
  const { contentLanguage, uiLocale } = useAppSettings();

  // Untrusted: a path segment off a deep link. parseRootParam applies the same
  // charset and length cap the web root page does, and takes the raw
  // useLocalSearchParams value (array and undefined cases included) so the
  // guard lives in one place. useMemo because it feeds an effect dependency.
  const buckwalter = useMemo(() => parseRootParam(params.buckwalter), [params.buckwalter]);

  const [entry, setEntry] = useState<RootEntry | null>(null);
  const [total, setTotal] = useState(0);
  const [neighbors, setNeighbors] = useState<Neighbors>(NO_NEIGHBORS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRoot() {
      // Before the DB is opened, not inside the query: an identifier that is
      // not a root has no business reaching SQLite at all.
      if (!buckwalter) {
        setEntry(null);
        setTotal(0);
        setNeighbors(NO_NEIGHBORS);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const [found, count, adjacent] = await Promise.all([
          getRootScreen(client, buckwalter),
          getRootOccurrenceCount(client, buckwalter),
          getAdjacentRoots(client, buckwalter),
        ]);
        if (!cancelled) {
          setEntry(found);
          setTotal(count);
          setNeighbors(adjacent);
        }
      } catch (cause) {
        // Same dead end as a root the corpus does not carry: nothing the
        // reader can act on either way. Logged for logcat.
        console.error('[root] load failed', { buckwalter, cause });
        if (!cancelled) {
          setEntry(null);
          setTotal(0);
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

  // Above the early returns, as every hook here must be: a render that bails
  // early would otherwise change the hook order.
  const loadPage = useCallback(
    async (offset: number, limit: number) => {
      if (!buckwalter) return [];
      const db = await openCorpusDb();
      const client = createExpoSqliteClient(db as ExpoSqliteLike);
      return getRootOccurrences(client, buckwalter, contentLanguage, offset, limit);
    },
    [buckwalter, contentLanguage],
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
          {t(uiLocale, 'root.notFound')}
        </Text>
      </View>
    );
  }

  const { root, definitions } = entry;

  // A plain View, not a ScrollView: this is the concordance list's header, and
  // a scroll view inside a FlatList header is a nested VirtualizedList, which
  // breaks the scroll rather than nesting it.
  const header = (
    <View style={{ padding: 20, gap: 18 }}>
      <EntryHeader uiLocale={uiLocale} arabic={root.root_arabic} count={root.occurrence_count}>
        {/* One pill per letter, right to left. The spaces in a compound root
            ("ق و ل") are separators, not letters, so they are stripped before
            splitting -- otherwise a three-letter root renders five pills, two
            of them blank. */}
        {Array.from(root.root_arabic.replace(/\s+/g, '')).map((letter, index) => (
          <View
            key={`${letter}-${index}`}
            testID="root-letter"
            style={{
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text style={{ color: theme.text, fontFamily: 'Hafs', fontSize: typography.body }}>
              {letter}
            </Text>
          </View>
        ))}
      </EntryHeader>

      <View
        accessibilityRole="toolbar"
        accessibilityLabel={t(uiLocale, 'root.adjacent')}
        style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}
      >
        {(['prev', 'next'] as const).map((side) => {
          const target = side === 'prev' ? neighbors.prev : neighbors.next;
          return (
            <Pressable
              key={side}
              testID={side === 'prev' ? 'root-previous' : 'root-next'}
              accessibilityRole="button"
              // Disabled, not hidden: an arrow that vanishes at the ends of the
              // list slides the other one under the thumb, and TalkBack is left
              // with nothing to announce where a control used to be.
              accessibilityState={{ disabled: target === null }}
              disabled={target === null}
              onPress={target ? () => router.push(`/root/${encodeURIComponent(target)}`) : undefined}
              style={{
                minHeight: touchTargets.compact,
                justifyContent: 'center',
                paddingHorizontal: 14,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: theme.border,
                opacity: target === null ? 0.4 : 1,
              }}
            >
              <Text style={{ color: target === null ? theme.mutedText : theme.text }}>
                {side === 'prev'
                  ? `← ${t(uiLocale, 'root.previous')}`
                  : `${t(uiLocale, 'root.next')} →`}
              </Text>
            </Pressable>
          );
        })}
      </View>

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

      <Text
        testID="concordance-heading"
        role="heading"
        style={{ color: theme.mutedText, fontSize: typography.caption }}
      >
        {t(uiLocale, 'concordance.heading')} ({total})
      </Text>
    </View>
  );

  return <ConcordanceList total={total} loadPage={loadPage} header={header} />;
}
