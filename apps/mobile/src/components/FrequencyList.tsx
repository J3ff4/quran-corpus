import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { getFrequencyRows, type FrequencyRow } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface FrequencyListProps {
  kind: 'roots' | 'lemmas' | 'verbs';
}

/** The Frequent pane's list. One component over three queries -- the rows
 *  differ only in where they link and whether they carry a gloss.
 *
 *  Not a Link: the row is a three-column layout, and expo-router's Link renders
 *  a Text on native, inside which a flexDirection View does not lay out. */
export function FrequencyList({ kind }: FrequencyListProps) {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
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
        const found = await getFrequencyRows(client, kind);
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
    // Same container LetterScreen uses: a bare indicator paints small and
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

  // ponytail: no empty state. All three queries are unfiltered top-200 over a
  // bundled DB, so an empty result means the DB is broken, which is the failed
  // branch above.
  return (
    <FlatList
      // Refetching on a chip tap does not reset the content offset, so without
      // this you land mid-list in the new kind with no sign it changed.
      key={kind}
      data={rows}
      keyExtractor={(item) => item.href}
      renderItem={({ item }) => (
        <Pressable
          testID="frequency-row"
          accessibilityRole="link"
          // Without a name the row announces as the bare concatenation of its
          // three children, with nothing to say the trailing number is a
          // count. t() has no interpolation, hence the concatenation here.
          accessibilityLabel={`${item.arabic}${item.gloss ? ` ${item.gloss}` : ''}, ${item.count} ${t(uiLocale, 'dictionary.occurrences')}`}
          onPress={() => router.push(item.href)}
          style={{
            // RTL, as in AlphabetGrid: the Arabic takes the start (right) edge
            // and the count the end. textAlign cannot do it -- the Arabic is a
            // content-sized flex child here, not LetterScreen's full-width row.
            flexDirection: 'row-reverse',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingVertical: 12,
            minHeight: touchTargets.minimum,
            gap: 12,
          }}
        >
          <Text
            style={{
              color: theme.text,
              fontFamily: 'Hafs',
              fontSize: typography.body,
              // writingDirection is iOS-only (see AyahText); Android resolves
              // direction from the content.
              writingDirection: 'rtl',
            }}
          >
            {item.arabic}
          </Text>
          {item.gloss ? (
            // The gloss is the verb's lemma -- Arabic, not Latin -- so it takes
            // the Uthmani face at body size like every other Arabic run.
            <Text
              numberOfLines={1}
              style={{
                color: theme.mutedText,
                flex: 1,
                fontFamily: 'Hafs',
                fontSize: typography.body,
                writingDirection: 'rtl',
              }}
            >
              {item.gloss}
            </Text>
          ) : null}
          <Text style={{ color: theme.mutedText }}>{item.count}</Text>
        </Pressable>
      )}
      style={{ flex: 1 }}
    />
  );
}
