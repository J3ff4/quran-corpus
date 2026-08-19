import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useNavigation } from 'expo-router';
import { AlphabetGrid } from '@/components/AlphabetGrid';
import { SearchHeaderButton } from '@/components/SearchHeaderButton';
import { t } from '@/i18n/uiStrings';
import { useAppSettings } from '@/settings/settingsStore';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

type Pane = 'browse' | 'frequent';

export function DictionaryScreen() {
  const { uiLocale } = useAppSettings();
  const theme = useThemeColors();
  const navigation = useNavigation();
  const [pane, setPane] = useState<Pane>('browse');

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
            <Text style={{ color: pane === option ? theme.background : theme.text }}>
              {t(uiLocale, option === 'browse' ? 'dictionary.browse' : 'dictionary.frequent')}
            </Text>
          </Pressable>
        ))}
      </View>

      {pane === 'browse' ? (
        <AlphabetGrid onSelect={(letter) => router.push(`/dictionary/letter/${encodeURIComponent(letter)}`)} />
      ) : null}
      {/* Task 6 renders the Frequent pane here. */}
    </View>
  );
}
