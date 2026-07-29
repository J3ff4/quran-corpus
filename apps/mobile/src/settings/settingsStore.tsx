import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { ContentLanguageCode, UiLocaleCode } from '../i18n/languages';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface AppSettings {
  uiLocale: UiLocaleCode;
  contentLanguage: ContentLanguageCode;
  theme: ThemePreference;
  fontScale: number;
  analyticsEnabled: boolean;
}

export interface AppSettingsContextValue extends AppSettings {
  setUiLocale: (locale: UiLocaleCode) => void;
  setContentLanguage: (language: ContentLanguageCode) => void;
  setTheme: (theme: ThemePreference) => void;
  setFontScale: (fontScale: number) => void;
  setAnalyticsEnabled: (enabled: boolean) => void;
}

const defaultSettings: AppSettings = {
  uiLocale: 'en',
  contentLanguage: 'en',
  theme: 'system',
  fontScale: 1,
  analyticsEnabled: false,
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      ...settings,
      setUiLocale: (uiLocale) => setSettings((current) => ({ ...current, uiLocale })),
      setContentLanguage: (contentLanguage) => setSettings((current) => ({ ...current, contentLanguage })),
      setTheme: (theme) => setSettings((current) => ({ ...current, theme })),
      setFontScale: (fontScale) => setSettings((current) => ({ ...current, fontScale })),
      setAnalyticsEnabled: (analyticsEnabled) => setSettings((current) => ({ ...current, analyticsEnabled })),
    }),
    [settings],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): AppSettingsContextValue {
  const value = useContext(AppSettingsContext);
  if (!value) throw new Error('useAppSettings must be used inside AppSettingsProvider');
  return value;
}
