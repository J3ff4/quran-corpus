import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';
import { contentLanguages, uiLocales, type ContentLanguageCode, type UiLocaleCode } from '../i18n/languages';
import { openUserDb } from '../data/userDb';
import { getSetting, saveSetting } from '../data/userRepository';

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

const settingKeys = ['uiLocale', 'contentLanguage', 'theme', 'fontScale', 'analyticsEnabled'] as const;

function isUiLocale(value: string | null): value is UiLocaleCode {
  return uiLocales.some((locale) => locale.code === value);
}

function isContentLanguage(value: string | null): value is ContentLanguageCode {
  return contentLanguages.some((language) => language.code === value);
}

function isTheme(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export async function loadPersistedAppSettings(client: MobileDataClient): Promise<AppSettings> {
  const [uiLocale, contentLanguage, theme, fontScale, analyticsEnabled] = await Promise.all(
    settingKeys.map((key) => getSetting(client, key)),
  );
  const persistedUiLocale = uiLocale ?? null;
  const persistedContentLanguage = contentLanguage ?? null;
  const persistedTheme = theme ?? null;

  return {
    uiLocale: isUiLocale(persistedUiLocale) ? persistedUiLocale : defaultSettings.uiLocale,
    contentLanguage: isContentLanguage(persistedContentLanguage) ? persistedContentLanguage : defaultSettings.contentLanguage,
    theme: isTheme(persistedTheme) ? persistedTheme : defaultSettings.theme,
    fontScale: fontScale ? Number(fontScale) || defaultSettings.fontScale : defaultSettings.fontScale,
    analyticsEnabled: analyticsEnabled === 'true',
  };
}

function settingValue(value: AppSettings[keyof AppSettings]): string {
  return String(value);
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [userClient, setUserClient] = useState<MobileDataClient | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSettings() {
      const db = await openUserDb();
      const client = createExpoSqliteClient(db as ExpoSqliteLike);
      const persisted = await loadPersistedAppSettings(client);
      if (!cancelled) {
        setUserClient(client);
        setSettings(persisted);
      }
    }

    hydrateSettings().catch(() => {
      // Keep defaults if local user settings cannot be opened.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateSetting<TKey extends keyof AppSettings>(key: TKey, value: AppSettings[TKey]) {
    setSettings((current) => ({ ...current, [key]: value }));
    if (userClient) {
      void saveSetting(userClient, key, settingValue(value));
    }
  }

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      ...settings,
      setUiLocale: (uiLocale) => updateSetting('uiLocale', uiLocale),
      setContentLanguage: (contentLanguage) => updateSetting('contentLanguage', contentLanguage),
      setTheme: (theme) => updateSetting('theme', theme),
      setFontScale: (fontScale) => updateSetting('fontScale', fontScale),
      setAnalyticsEnabled: (analyticsEnabled) => updateSetting('analyticsEnabled', analyticsEnabled),
    }),
    [settings, userClient],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): AppSettingsContextValue {
  const value = useContext(AppSettingsContext);
  if (!value) throw new Error('useAppSettings must be used inside AppSettingsProvider');
  return value;
}
