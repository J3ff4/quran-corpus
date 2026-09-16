import { StatusBar } from 'expo-status-bar';

import { useIsDarkTheme } from '@/theme/themeContext';

export interface ThemedStatusBarProps {
  /** Takes the clock and the battery off screen with the rest of the chrome. */
  hidden?: boolean;
}

/**
 * The system status bar, coloured from the APP's theme rather than the OS's.
 *
 * expo-status-bar defaults to `auto`, which reads `useColorScheme()` -- the
 * phone's setting. This app has its own: Light, Dark or System (Settings). A
 * phone in dark mode running the app in Light therefore drew white glyphs on
 * the paper background, and the clock, the battery and the signal bars were
 * invisible (owner, on the device, 2026-09-16).
 *
 * Every mounted instance has to say it. The expo component always passes a
 * resolved `barStyle` down to RN's StatusBar, whose stack is last-mounted-wins
 * per prop -- so a screen mounting a bare `<StatusBar hidden>` would put the
 * OS's answer back for the whole app.
 */
export function ThemedStatusBar({ hidden = false }: ThemedStatusBarProps) {
  // Dark theme -> light glyphs. `style` names the CONTENT, not the bar.
  return <StatusBar style={useIsDarkTheme() ? 'light' : 'dark'} hidden={hidden} />;
}
