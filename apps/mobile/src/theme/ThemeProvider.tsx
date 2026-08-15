import { useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useAppSettings } from '@/settings/settingsStore';
import { ThemeContext } from './themeContext';
import { themeColors } from './tokens';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { theme } = useAppSettings();
  const systemScheme = useColorScheme();
  // useColorScheme returns null while the OS value is still resolving; treat
  // that as light rather than flashing dark on a light device.
  const resolved: keyof typeof themeColors = theme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : theme;

  const value = useMemo(() => themeColors[resolved], [resolved]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
