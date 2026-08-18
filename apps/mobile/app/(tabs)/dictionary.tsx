import { View } from 'react-native';
import { useThemeColors } from '@/theme/themeContext';

/** Filled in by Task 5 (Browse) and Task 6 (Frequent). A stub rather than a
 *  missing file: the tab bar ships in this task, and an absent route renders
 *  as a blank screen with no name on it. */
export default function DictionaryRoute() {
  const theme = useThemeColors();
  return <View style={{ flex: 1, backgroundColor: theme.background }} />;
}
