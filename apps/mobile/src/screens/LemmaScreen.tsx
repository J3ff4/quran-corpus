import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import type { LemmaEntry } from '@quran-corpus/data/mobile';
import { ConcordanceList } from '@/components/ConcordanceList';
import { getLemmaOccurrences, getLemmaScreen } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';

export interface LemmaScreenProps {
  /** Already validated by the route. `null` is an identifier that is not a
   *  lemma, which renders the not-found state without touching the DB. */
  lemmaBuckwalter: string | null;
}

/** One lemma: its Arabic form, the commonest word-by-word glosses it takes,
 *  a link to its root, and every occurrence in the corpus paging in beneath.
 *  Reached from a dictionary Frequent-pane row (lemma or verb) or a deep link.
 *  Deliberately thinner than web's lemma page: the senses breakdown,
 *  occurrence count and root-definition card live on the root screen this
 *  links to, not duplicated here. */
export function LemmaScreen({ lemmaBuckwalter }: LemmaScreenProps) {
  const { uiLocale, contentLanguage } = useAppSettings();
  const theme = useThemeColors();
  const sizes = useArabicSizes();

  const [entry, setEntry] = useState<LemmaEntry | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(lemmaBuckwalter !== null);

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
    <View style={{ padding: 20, gap: 12 }}>
      <Text
        style={{
          color: theme.text,
          fontFamily: 'Hafs',
          fontSize: sizes.title,
          textAlign: 'right',
          writingDirection: 'rtl',
        }}
      >
        {entry.lemma}
      </Text>
      {entry.transliteration ? (
        <Text style={{ color: theme.mutedText, fontSize: typography.body }}>{entry.transliteration}</Text>
      ) : null}
      {entry.top_glosses.length > 0 ? (
        <View style={{ gap: 4 }}>
          {/* Contextual word-by-word translations, not definitions -- the
              commonest gloss for a word can be a whole clause. Unlabelled
              these read as the lemma's meaning; see LemmaEntry.top_glosses. */}
          <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
            {t(uiLocale, 'lemma.translatedAs')}
          </Text>
          <Text style={{ color: theme.text, fontSize: typography.body }}>
            {entry.top_glosses.join(' · ')}
          </Text>
        </View>
      ) : null}
      {entry.root_buckwalter ? (
        <Link
          testID="lemma-root"
          href={`/root/${encodeURIComponent(entry.root_buckwalter)}`}
          accessibilityRole="link"
          style={{ color: theme.accent, paddingVertical: 12, minHeight: touchTargets.minimum }}
        >
          {t(uiLocale, 'word.root')}
        </Link>
      ) : null}
    </View>
  );

  return <ConcordanceList total={total} loadPage={loadPage} header={header} />;
}
