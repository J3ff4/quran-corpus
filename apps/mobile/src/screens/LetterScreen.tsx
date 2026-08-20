import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Link } from 'expo-router';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import type { RootSearchItem } from '@quran-corpus/data/mobile';
import { getRootsForLetter } from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useArabicSizes } from '@/theme/useArabicSizes';

export interface LetterScreenProps {
  /** Already validated by the route. `null` is a letter the alphabet does not
   *  carry, which renders the empty state without touching the DB. */
  letter: string | null;
}

export function LetterScreen({ letter }: LetterScreenProps) {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const sizes = useArabicSizes();

  const [roots, setRoots] = useState<RootSearchItem[]>([]);
  const [loading, setLoading] = useState(letter !== null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (letter === null) {
      setRoots([]);
      setFailed(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFailed(false);
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const found = await getRootsForLetter(client, letter);
        if (!cancelled) setRoots(found);
      } catch (cause) {
        // Distinct from a letter with no roots: this one is worth retrying, so
        // it must not read as "this letter is empty". Logged for logcat.
        console.error('[dictionary] letter load failed', { letter, cause });
        if (!cancelled) {
          setRoots([]);
          setFailed(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [letter]);

  function body() {
    if (loading) {
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
            {t(uiLocale, 'dictionary.loadFailed')}
          </Text>
        </View>
      );
    }

    if (roots.length === 0) {
      return (
        <View style={{ flex: 1, padding: 20 }}>
          <Text style={{ color: theme.mutedText }}>{t(uiLocale, 'dictionary.noRoots')}</Text>
        </View>
      );
    }

    return (
      <FlatList
        data={roots}
        keyExtractor={(item) => item.root_buckwalter}
        renderItem={({ item }) => (
          <Link
            testID="letter-root"
            href={`/root/${encodeURIComponent(item.root_buckwalter)}`}
            accessibilityRole="link"
            style={{
              color: theme.text,
              fontFamily: 'Hafs',
              fontSize: typography.body,
              paddingHorizontal: 20,
              paddingVertical: 14,
              minHeight: touchTargets.minimum,
              textAlign: 'right',
              // textAlign places the block; writingDirection is iOS-only
              // (see AyahText). Android resolves direction from the content.
              writingDirection: 'rtl',
            }}
          >
            {item.root_arabic}
          </Link>
        )}
        style={{ flex: 1 }}
      />
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* The root Stack sets `title: ''` on the stated assumption that every
          screen names itself; without this the letter list has no heading at
          all. */}
      {letter === null ? null : (
        <View style={{ paddingHorizontal: 20, paddingTop: 20, gap: 4 }}>
          <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>
            {t(uiLocale, 'dictionary.letterCaption')}
          </Text>
          <Text
            accessibilityRole="header"
            style={{
              color: theme.text,
              fontFamily: 'Hafs',
              fontSize: sizes.title,
              textAlign: 'right',
              writingDirection: 'rtl',
            }}
          >
            {letter}
          </Text>
        </View>
      )}
      {body()}
    </View>
  );
}
