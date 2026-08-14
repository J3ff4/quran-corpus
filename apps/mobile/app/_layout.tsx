import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { openCorpusDb, useCorpusFonts } from '@/data/openCorpusDb';
import { AppSettingsProvider } from '@/settings/settingsStore';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useCorpusFonts();
  const [corpusReady, setCorpusReady] = useState(false);
  const [corpusError, setCorpusError] = useState<Error | null>(null);

  // First launch extracts ~134 MB out of the app bundle. Doing it here means the
  // wait lands on the loading state that already exists for fonts, instead of
  // inside whichever tab the user happened to open first. Later launches find
  // the file already in place and resolve immediately.
  //
  // ponytail: spinner only, no "preparing the Quran text" caption — the locale
  // lives in AppSettingsProvider, which is below this gate, and an English-only
  // string in a trilingual app reads worse than no string.
  useEffect(() => {
    let cancelled = false;

    openCorpusDb().then(
      () => {
        if (!cancelled) setCorpusReady(true);
      },
      (error: unknown) => {
        if (!cancelled) setCorpusError(error instanceof Error ? error : new Error(String(error)));
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  if (fontError) throw fontError;
  if (corpusError) throw corpusError;
  if (!fontsLoaded || !corpusReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppSettingsProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </AppSettingsProvider>
    </GestureHandlerRootView>
  );
}
