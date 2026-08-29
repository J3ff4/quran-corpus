import { SettingsScreen } from '@/screens/SettingsScreen';

// A route file, nothing else: expo-router's require.context makes every file
// under app/ a route, so the screen itself lives in src/screens where its test
// can import it without becoming one.
export default function SettingsRoute() {
  return <SettingsScreen />;
}
