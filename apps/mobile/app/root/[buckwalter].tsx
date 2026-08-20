import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { definitionSourceLabel, type RootEntry } from '@quran-corpus/data/mobile';
import { ConcordanceList } from '@/components/ConcordanceList';
import { getRootOccurrenceCount, getRootOccurrences, getRootScreen } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { parseRootParam } from '@/data/routeParams';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';

/** One root: its Arabic form, the derived forms the corpus records for it, the
 *  lexicon definitions, and every occurrence in the corpus paging in beneath.
 *  Reached from the reader sheet's root link or from a deep link. */
export default function RootRoute() {
  const params = useLocalSearchParams<{ buckwalter: string }>();
  const theme = useThemeColors();
  const sizes = useArabicSizes();
  const { contentLanguage, uiLocale } = useAppSettings();

  // Untrusted: a path segment off a deep link. parseRootParam applies the same
  // charset and length cap the web root page does, and takes the raw
  // useLocalSearchParams value (array and undefined cases included) so the
  // guard lives in one place. useMemo because it feeds an effect dependency.
  const buckwalter = useMemo(() => parseRootParam(params.buckwalter), [params.buckwalter]);

  const [entry, setEntry] = useState<RootEntry | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRoot() {
      // Before the DB is opened, not inside the query: an identifier that is
      // not a root has no business reaching SQLite at all.
      if (!buckwalter) {
        setEntry(null);
        setTotal(0);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const [found, count] = await Promise.all([
          getRootScreen(client, buckwalter),
          getRootOccurrenceCount(client, buckwalter),
        ]);
        if (!cancelled) {
          setEntry(found);
          setTotal(count);
        }
      } catch (cause) {
        // Same dead end as a root the corpus does not carry: nothing the
        // reader can act on either way. Logged for logcat.
        console.error('[root] load failed', { buckwalter, cause });
        if (!cancelled) {
          setEntry(null);
          setTotal(0);
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

  const { root, forms, definitions } = entry;

  // A plain View, not a ScrollView: this is the concordance list's header, and
  // a scroll view inside a FlatList header is a nested VirtualizedList, which
  // breaks the scroll rather than nesting it.
  const header = (
    <View style={{ padding: 20, gap: 18 }}>
      <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
        {t(uiLocale, 'word.root')}
      </Text>
      <Text
        accessibilityRole="header"
        style={{
          color: theme.text,
          fontFamily: 'Hafs',
          fontSize: sizes.title,
          textAlign: 'right',
          // textAlign places the block; writingDirection is iOS-only
          // (see AyahText). Android resolves direction from the content.
          writingDirection: 'rtl',
        }}
      >
        {root.root_arabic}
      </Text>

      {forms.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
            {t(uiLocale, 'root.forms')}
          </Text>
          {forms.map((form) => (
            <View
              key={form.id}
              testID="root-form"
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                gap: 4,
              }}
            >
              {form.form_arabic ? (
                <Text
                  style={{
                    color: theme.text,
                    fontFamily: 'Hafs',
                    fontSize: typography.body,
                    textAlign: 'right',
                    writingDirection: 'rtl',
                  }}
                >
                  {form.form_arabic}
                </Text>
              ) : null}
              <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
                {form.pos_label}
              </Text>
              {form.gloss ? (
                <Text style={{ color: theme.text, fontSize: typography.body }}>{form.gloss}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
          {t(uiLocale, 'root.definitions')}
        </Text>
        {definitions.length > 0 ? (
          definitions.map((definition) => {
            // An unmapped tag prints as itself -- see definitionSources for why
            // a visibly wrong credit beats a silently uncredited one. This text
            // is third-party licensed (§11) and must never render bare.
            const label = definitionSourceLabel(definition.source);
            return (
              <View key={definition.id} style={{ gap: 4 }}>
                <Text style={{ color: theme.text, fontSize: typography.body }}>
                  {definition.definition}
                </Text>
                {label ? (
                  <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
                    {label}
                  </Text>
                ) : null}
              </View>
            );
          })
        ) : (
          // 24 roots still carry no definition (hw_gap_24.tsv). Saying so keeps
          // the forms above visible; rendering nothing reads as a broken page.
          <Text style={{ color: theme.mutedText, fontSize: typography.body }}>
            {t(uiLocale, 'root.noDefinition')}
          </Text>
        )}
      </View>
    </View>
  );

  return <ConcordanceList total={total} loadPage={loadPage} header={header} />;
}
