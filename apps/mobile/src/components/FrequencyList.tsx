import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { DictionaryRow } from '@/components/DictionaryRow';
import { FREQUENCY_LIMIT, getFrequencyRows, type FrequencyRow } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useListBottomPadding } from '@/theme/useListBottomPadding';

export interface FrequencyListProps {
  kind: 'roots' | 'lemmas' | 'verbs';
}

/** The Frequent pane's ranked table. One component over three queries -- the
 *  rows differ only in where they link and whether they carry a gloss, and the
 *  row itself is Browse's (`DictionaryRow`). */
export function FrequencyList({ kind }: FrequencyListProps) {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const paddingBottom = useListBottomPadding();
  const [rows, setRows] = useState<FrequencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await getFrequencyRows(client, kind, FREQUENCY_LIMIT);
        if (!cancelled) setRows(found);
      } catch (cause) {
        console.error('[dictionary] frequency load failed', { kind, cause });
        if (!cancelled) {
          setRows([]);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
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
          paddingHorizontal: 20,
          paddingVertical: 8,
          gap: 12,
        }}
      >
        {/* The same 32/12 rank gutter DictionaryRow lays out, so the labels sit
            over the columns they name. */}
        <Text style={{ width: 32, color: theme.mutedText, fontSize: typography.caption }}>
          {t(uiLocale, 'dictionary.columnRank')}
        </Text>
        <View
          style={{
            flex: 1,
            flexDirection: 'row-reverse',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
            {t(uiLocale, 'dictionary.columnForm')}
          </Text>
          <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
            {t(uiLocale, 'dictionary.columnCount')}
          </Text>
        </View>
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
        contentContainerStyle={{ paddingBottom }}
      />
    </View>
  );
}
