import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';
import { getRootSearchList, rootFirstLetter } from '@quran-corpus/data/mobile';
import { AlphabetGrid } from '@/components/AlphabetGrid';
import { SearchHeaderButton } from '@/components/SearchHeaderButton';
import { openCorpusDb } from '@/data/openCorpusDb';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

type Pane = 'browse' | 'frequent';

/** Stable identity: `available ?? new Set()` would hand AlphabetGrid a fresh
 *  set on every render. */
const NO_LETTERS: ReadonlySet<string> = new Set();

export function DictionaryScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const navigation = useNavigation();
  const [pane, setPane] = useState<Pane>('browse');
  // null while loading. The grid renders every cell disabled until this
  // arrives, rather than flashing an all-enabled alphabet that then dims.
  const [available, setAvailable] = useState<ReadonlySet<string> | null>(null);

  // Which letters have roots at all. Folded with the shared rootFirstLetter,
  // the same function getRootsForLetter buckets with -- a second copy of the
  // hamza-seat rules here would enable a letter whose screen then comes up
  // empty.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openCorpusDb();
        const client = createExpoSqliteClient(db as ExpoSqliteLike);
        const roots = await getRootSearchList(client);
        if (!cancelled) setAvailable(new Set(roots.map((root) => rootFirstLetter(root.root_arabic))));
      } catch (cause) {
        // Empty set, so every cell stays disabled. Safe in the sense that
        // matters here: a dead grid is inert, whereas enabling all 29 sends
        // the user to a letter screen that cannot load either.
        console.error('[dictionary] letter availability failed', cause);
        if (!cancelled) setAvailable(NO_LETTERS);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // The third of the spec's three search entry points; the reader's and Home's
  // landed in Task 3.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <SearchHeaderButton uiLocale={uiLocale} onPress={() => router.push('/search')} />
      ),
    });
  }, [navigation, uiLocale]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ flexDirection: 'row', padding: 16, gap: 8 }}>
        {(['browse', 'frequent'] as const).map((option) => (
          <Pressable
            key={option}
            testID={`dictionary-pane-${option}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: pane === option }}
            onPress={() => setPane(option)}
            style={{
              flex: 1,
              minHeight: touchTargets.minimum,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.border,
              backgroundColor: pane === option ? theme.accent : 'transparent',
            }}
          >
            <Text style={{ color: pane === option ? theme.onAccent : theme.text }}>
              {t(uiLocale, option === 'browse' ? 'dictionary.browse' : 'dictionary.frequent')}
            </Text>
          </Pressable>
        ))}
      </View>

      {pane === 'browse' ? (
        <AlphabetGrid
          uiLocale={uiLocale}
          available={available ?? NO_LETTERS}
          onSelect={(letter) => router.push(`/dictionary/letter/${encodeURIComponent(letter)}`)}
        />
      ) : null}
      {/* Task 6 renders the Frequent pane here. */}
    </View>
  );
}
