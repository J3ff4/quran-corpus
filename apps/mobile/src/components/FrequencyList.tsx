import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { DictionaryRow } from '@/components/DictionaryRow';
import { FREQUENCY_LIMIT, getFrequencyRows, type FrequencyRow } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { fonts, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

export interface FrequencyListProps {
  kind: 'roots' | 'lemmas' | 'verbs';
}

/** Rows already fetched, by kind. The corpus DB is bundled and opened
 *  `query_only`, so a kind's ranking cannot change while the app runs and a
 *  second query for it can only return what is already here.
 *
 *  Worth the memory because this component unmounts constantly: it is torn
 *  down every time the reader flips to Browse and remounted on the way back,
 *  and each mount was re-running a 1000-row query and flashing a spinner over
 *  a list it had already drawn (owner, 2026-08-27). */
const cache = new Map<FrequencyListProps['kind'], FrequencyRow[]>();

/** Empties the cache above. Nothing in the app calls this -- the data it holds
 *  is immutable for the life of the process -- but a test that asserts on
 *  query counts has to start from a known state. */
export function resetFrequencyCache() {
  cache.clear();
}

/** The Frequent pane's ranked table. One component over three queries -- the
 *  rows differ only in where they link and whether they carry a gloss, and the
 *  row itself is Browse's (`DictionaryRow`). */
export function FrequencyList({ kind }: FrequencyListProps) {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();
  // What is loaded, tagged with the kind it belongs to -- not a bare row array
  // plus a separate loading flag.
  //
  // With the flag, a chip tap re-rendered before its effect ran: for that
  // commit `rows` still held the previous kind's rows and `loading` was still
  // false, so the pane painted one kind's data under another kind's header,
  // and remounted the FlatList underneath it (the list is keyed by kind). Only
  // afterwards did the effect set the spinner. Deriving both from the tag
  // instead means a kind with nothing loaded reads as loading in the same
  // commit as the tap, with no window where it reads as anything else (#33).
  //
  // Read during render rather than in an effect for the same reason the seed
  // was: an effect runs after paint, so a revisit would still show a frame of
  // spinner over rows that were ready before it started.
  const [loaded, setLoaded] = useState<{ kind: FrequencyListProps['kind']; rows: FrequencyRow[] } | null>(
    () => {
      const hit = cache.get(kind);
      return hit ? { kind, rows: hit } : null;
    },
  );
  // Tagged by kind for the same reason `loaded` is: an untagged flag left the
  // previous kind's error on screen until the effect cleared it.
  const [failedKind, setFailedKind] = useState<FrequencyListProps['kind'] | null>(null);

  const cached = cache.get(kind);
  const rows = loaded?.kind === kind ? loaded.rows : (cached ?? null);
  const failed = failedKind === kind;
  const loading = rows === null && !failed;

  useEffect(() => {
    let cancelled = false;
    const hit = cache.get(kind);
    if (hit) {
      // A kind change, with that kind already in hand. The render above is
      // already showing these rows off the cache; this only records which kind
      // they belong to so a later cache clear does not strand them.
      setLoaded({ kind, rows: hit });
      setFailedKind(null);
      return;
    }
    setFailedKind(null);
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await getFrequencyRows(client, kind, FREQUENCY_LIMIT);
        // Cached whether or not this mount is still interested: the rows are
        // correct for the kind regardless of who asked.
        cache.set(kind, found);
        if (!cancelled) setLoaded({ kind, rows: found });
      } catch (cause) {
        console.error('[dictionary] frequency load failed', { kind, cause });
        if (!cancelled) setFailedKind(kind);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kind]);

  if (loading) {
    // Full-height container, not a bare indicator: that paints small and
    // left-aligned, then the pane snaps to a full-height list on every tap.
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (failed) {
    return (
      <View style={{ flex: 1, padding: 20 }}>
        <Text accessibilityRole="alert" style={{ color: theme.mutedText, fontSize: typography.body }}>
          {t(uiLocale, 'dictionary.frequentFailed')}
        </Text>
      </View>
    );
  }

  // ponytail: no empty state. All three queries are unfiltered over a bundled
  // DB -- capped, but never narrowed -- so an empty result means the DB is
  // broken, which is the failed branch above.
  const label = {
    color: theme.mutedText,
    fontFamily: fonts.displaySemiBold,
    fontSize: typography.caption,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  } as const;

  return (
    <View style={{ flex: 1 }}>
      <View
        testID="frequency-header"
        // Deliberately no role and no accessibility props: not
        // accessibilityRole="header", which lands as ARIA's banner landmark,
        // and not hidden either -- it reads once above the list and is what
        // names the trailing number as a count.
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          // 32, not 20: the rows are cards now, insetting 16 from the screen
          // and padding another 16 inside. The labels have to start where the
          // columns they name start, or they name the gap between them.
          paddingHorizontal: 32,
          // The kind chips sit directly above these labels and were touching
          // them. The gap belongs here rather than under the chips, so the
          // labels keep their own clearance whoever renders above them.
          paddingTop: 14,
          paddingBottom: 8,
          gap: 12,
        }}
      >
        {/* The same 34/12 rank gutter DictionaryRow lays out. */}
        <Text style={[label, { minWidth: 34 }]}>{t(uiLocale, 'dictionary.columnRank')}</Text>
        <Text style={[label, { flex: 1 }]}>{t(uiLocale, 'dictionary.columnCount')}</Text>
        <Text style={label}>{t(uiLocale, 'dictionary.columnForm')}</Text>
      </View>
      <FlatList
        // Refetching on a chip tap does not reset the content offset, so
        // without this you land mid-list in the new kind with no sign it
        // changed.
        key={kind}
        data={rows}
        keyExtractor={(item) => item.href}
        renderItem={({ item, index }) => (
          <DictionaryRow
            arabic={item.arabic}
            gloss={item.gloss}
            count={item.count}
            rank={index + 1}
            href={item.href}
            uiLocale={uiLocale}
          />
        )}
        style={{ flex: 1 }}
        // The rows are cards carrying their own side margins and the gap
        // between them, the same split Browse uses.
        contentContainerStyle={{ paddingTop: 4, paddingBottom }}
      />
    </View>
  );
}
