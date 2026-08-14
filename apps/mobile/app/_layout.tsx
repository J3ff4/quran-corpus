import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { openCorpusDb, useCorpusFonts } from '@/data/openCorpusDb';
import { AppSettingsProvider } from '@/settings/settingsStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

// Hold the native splash across the first-launch extract below. Expo hides it
// as soon as the root component mounts, which on a cold install would flash
// splash -> blank -> spinner for the several seconds the copy takes.
void SplashScreen.preventAutoHideAsync();

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

  // Release the splash once there is something to show -- including an error
  // screen. Hiding only on success would leave a failed launch stuck behind the
  // splash with no way to see what went wrong.
  const settled = (fontsLoaded && corpusReady) || Boolean(fontError) || Boolean(corpusError);

  useEffect(() => {
    if (settled) void SplashScreen.hideAsync();
  }, [settled]);

  if (fontError || corpusError) {
    // Hidden here rather than left to the effect above: React aborts the render
    // when a component throws, so this component never commits and none of its
    // effects run. With auto-hide disabled that left a failed launch sitting
    // behind the native splash forever -- the one case where the user most
    // needs to see what went wrong.
    void SplashScreen.hideAsync();
    throw fontError ?? corpusError;
  }
  if (!fontsLoaded || !corpusReady) {
    // Sits behind the held splash; only ever seen if preventAutoHideAsync lost
    // the race, which is exactly when a bare white screen would be worst.
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppSettingsProvider>
        <ThemeProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </ThemeProvider>
      </AppSettingsProvider>
    </GestureHandlerRootView>
  );
}
