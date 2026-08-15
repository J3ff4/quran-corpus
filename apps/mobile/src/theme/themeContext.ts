import { createContext, useContext } from 'react';

import { themeColors } from './tokens';

export type ThemeColors = typeof themeColors.light;

// Deliberately split from ThemeProvider: this module imports nothing but react
// and the token table, so a component that only *reads* colours stays free of
// react-native and the settings store. Component tests mock 'react-native' with
// a partial factory, and a leaf importing the provider would drag useColorScheme
// through that mock and fail at import time on an export the factory omits.
//
// Default is the light palette rather than null, so a subtree mounted without
// the provider paints readable defaults instead of crashing -- which matters
// most for an error screen rendered above it.
export const ThemeContext = createContext<ThemeColors>(themeColors.light);

export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext);
}
