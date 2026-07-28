import { Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useCorpusFonts } from '@/data/openCorpusDb';

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

  return <Stack screenOptions={{ headerShown: false }} />;
}
