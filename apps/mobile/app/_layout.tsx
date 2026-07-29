import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useCorpusFonts } from '@/data/openCorpusDb';
import { AppSettingsProvider } from '@/settings/settingsStore';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useCorpusFonts();

  if (fontError) throw fontError;
  if (!fontsLoaded) {
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
