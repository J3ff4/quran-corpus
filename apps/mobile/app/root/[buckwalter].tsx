import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { definitionSourceLabel, type RootEntry } from '@quran-corpus/data/mobile';
import { getRootScreen } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { parseRootParam } from '@/data/routeParams';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';

/** One root: its Arabic form, the derived forms the corpus records for it, and
 *  the lexicon definitions. Reached from the reader sheet's root link or from a
 *  deep link. */
export default function RootRoute() {
  const params = useLocalSearchParams<{ buckwalter: string }>();
  const theme = useThemeColors();
  const sizes = useArabicSizes();
  const { uiLocale } = useAppSettings();

  // Untrusted: a path segment off a deep link. parseRootParam is the same
  // validator the web root page uses -- charset, length cap, and a refusal of
  // double-encoded input -- so the two products cannot disagree about what a
  // root identifier is.
  const buckwalter = useMemo(() => {
    const raw = Array.isArray(params.buckwalter) ? params.buckwalter[0] : params.buckwalter;
    return raw ? parseRootParam(raw) : null;
  }, [params.buckwalter]);

  const [entry, setEntry] = useState<RootEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRoot() {
      // Before the DB is opened, not inside the query: an identifier that is
      // not a root has no business reaching SQLite at all.
      if (!buckwalter) {
        setEntry(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await getRootScreen(client, buckwalter);
        if (!cancelled) setEntry(found);
      } catch (cause) {
        // Same dead end as a root the corpus does not carry: nothing the
        // reader can act on either way. Logged for logcat.
        console.error('[root] load failed', { buckwalter, cause });
        if (!cancelled) setEntry(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRoot();
    return () => {
      cancelled = true;
    };
  }, [buckwalter]);

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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 20, gap: 18 }}
    >
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
          // See AyahText: textAlign places the block, writingDirection drives
          // the bidi resolution inside the Arabic run.
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
    </ScrollView>
  );
}
