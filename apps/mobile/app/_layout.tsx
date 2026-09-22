import { NavigationBar } from 'expo-navigation-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { configureAudioSession } from '@/audio/ayahAudio';
import { RecitationProvider } from '@/audio/recitationContext';
import { Bloom } from '@/components/Bloom';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { openCorpusDb, useCorpusFonts } from '@/data/openCorpusDb';
import { AppSettingsProvider } from '@/settings/settingsStore';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useThemeColors } from '@/theme/themeContext';

// Hold the native splash across the first-launch extract below. Expo hides it
// as soon as the root component mounts, which on a cold install would flash
// splash -> blank -> spinner for the several seconds the copy takes.
void SplashScreen.preventAutoHideAsync();

/**
 * The tab group anchors the root stack, so a deep link opens on top of it
 * rather than as the stack's only route.
 *
 * Without this, launching cold into `/surah/2?ayah=50` left the reader as the
 * root: the header still drew its back arrow, and pressing it produced
 * `The action 'GO_BACK' was not handled by any navigator` and went nowhere
 * (#35). In-app navigation was never affected -- every route there pushes onto
 * a real stack -- which is why it took an external link to surface.
 *
 * `anchor` is the expo-router 57 spelling; `initialRouteName` is still read as
 * a fallback, but writing the deprecated name would be pinning this to the
 * older behaviour.
 */
export const unstable_settings = { anchor: '(tabs)' };

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

    // Rides the same startup effect rather than adding a second one: the audio
    // session is process-wide and has nothing to do with the extract, and it
    // has to be set before the first play rather than during it. Swallowed the
    // way the reading-day write is -- a failed session config costs the lock
    // screen its controls, and holding the splash for that would cost the user
    // the whole app.
    configureAudioSession().catch((cause: unknown) => {
      console.error('[audio] session config failed', { cause });
    });

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
          {/* Inside AppSettingsProvider, which owns the chosen reciter, and
              outside the navigator, so a tab switch never remounts the engine
              -- a remount destroys the player and takes the sound with it. */}
          <RecitationProvider>
            <AppStack />
          </RecitationProvider>
        </ThemeProvider>
      </AppSettingsProvider>
    </GestureHandlerRootView>
  );
}

// Split out of RootLayout: useThemeColors only works below ThemeProvider, and
// this renders inside it.
function AppStack() {
  const theme = useThemeColors();
  return (
    <View style={{ flex: 1 }}>
      {/* The baseline the system navigation bar falls back to. Every other
          instance in the app asks for it to be HIDDEN and is mounted later --
          expo-navigation-bar merges the props of all mounted instances in mount
          order, so the last one to ask wins and this one decides what happens
          once they have all gone. Without a standing instance the bar's state
          when the final asker unmounts is whatever the native module last
          applied, which is how a sheet closing on one screen would leave the
          buttons hidden on every other. */}
      <NavigationBar hidden={false} />
      {/* The baseline for the status bar's glyphs, from the APP's theme --
          expo's default follows the OS, so a phone in dark mode running the
          app in Light drew a white clock on paper (owner, 2026-09-16). The
          mushaf mounts its own to hide the bar with the chrome. */}
      <ThemedStatusBar />
      {/* One instance for the whole app, behind the navigator. A per-screen
          copy would repaint a full-screen gradient on every navigation. */}
      <Bloom />
      <Stack
        screenOptions={{
          // Transparent background, but NOT a transparent (overlaying) header:
          // the bloom has to show through the header strip, and a tinted one
          // would cut a flat band across it -- but `headerTransparent` also
          // stops the navigator insetting the content, so every screen's own
          // heading rendered underneath the back arrow.
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: 'transparent' },
          // Every screen renders its own heading; a nav title repeating it
          // would put the same words on screen twice. The header exists for the
          // back affordance.
          title: '',
        }}
      >
        {/* The tab group draws its own chrome via app/(tabs)/_layout. */}
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* Morphology draws its own HeaderCard, back button included -- the
            same card the reader publishes as its header. Left on, the
            navigator's back arrow sat in a strip above that card and the
            screen carried two of them. The reader reaches the same place by
            replacing `header` rather than hiding it, because its bar has to
            fade a title against the list's scroll and so must live where the
            scroll does. */}
        <Stack.Screen name="morphology" options={{ headerShown: false }} />
        <Stack.Screen name="surah/[surahId]/words" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}
