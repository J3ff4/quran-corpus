import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

type PendingSettingEntry = [keyof AppSettings, AppSettings[keyof AppSettings]];

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [userClient, setUserClient] = useState<MobileDataClient | null>(null);
  const pendingSettingsRef = useRef<Partial<AppSettings>>({});
  const pendingPersistenceRef = useRef<Promise<void>>(Promise.resolve());
  const persistenceRetryAttemptRef = useRef(0);
  const persistenceRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistenceSchedulerActiveRef = useRef(false);

  useEffect(() => {
    persistenceSchedulerActiveRef.current = true;
    let cancelled = false;

    async function hydrateSettings() {
      const db = await openUserDb();
      const client = createExpoSqliteClient(db as ExpoSqliteLike);
      const persisted = await loadPersistedAppSettings(client);
      if (!cancelled) {
        const pendingSettings = { ...pendingSettingsRef.current };
        setUserClient(client);
        setSettings({ ...persisted, ...pendingSettings });
        schedulePendingSettingsPersistence(client);
      }
    }

    hydrateSettings().catch(() => {
      // Keep defaults if local user settings cannot be opened.
    });
    return () => {
      cancelled = true;
      persistenceSchedulerActiveRef.current = false;
      if (persistenceRetryTimerRef.current) {
        clearTimeout(persistenceRetryTimerRef.current);
        persistenceRetryTimerRef.current = null;
      }
    };
  }, []);

  function updateSetting<TKey extends keyof AppSettings>(key: TKey, value: AppSettings[TKey]) {
    setSettings((current) => ({ ...current, [key]: value }));
    if (userClient) {
      queuePendingSetting(key, value);
      schedulePendingSettingsPersistence(userClient);
      return;
    }
    queuePendingSetting(key, value);
  }

  function queuePendingSetting<TKey extends keyof AppSettings>(key: TKey, value: AppSettings[TKey]) {
    pendingSettingsRef.current = { ...pendingSettingsRef.current, [key]: value };
  }

  function schedulePendingSettingsPersistence(client: MobileDataClient, delayMs = 0) {
    if (!persistenceSchedulerActiveRef.current) return;
    if (delayMs > 0) {
      if (persistenceRetryTimerRef.current) clearTimeout(persistenceRetryTimerRef.current);
      persistenceRetryTimerRef.current = setTimeout(() => {
        persistenceRetryTimerRef.current = null;
        if (!persistenceSchedulerActiveRef.current) return;
        schedulePendingSettingsPersistence(client);
      }, delayMs);
      return;
    }
    if (persistenceRetryTimerRef.current) {
      clearTimeout(persistenceRetryTimerRef.current);
      persistenceRetryTimerRef.current = null;
    }
    pendingPersistenceRef.current = pendingPersistenceRef.current
      .catch(() => undefined)
      .then(() => persistPendingSettings(client, { ...pendingSettingsRef.current }));
  }

  async function persistPendingSettings(client: MobileDataClient, pendingSettings: Partial<AppSettings>) {
    const entries = Object.entries(pendingSettings) as PendingSettingEntry[];
    const results = await Promise.allSettled(
      entries.map(([key, value]) => saveSetting(client, key, settingValue(value))),
    );

    const nextPending = { ...pendingSettingsRef.current };
    const attemptedKeys = new Set(entries.map(([key]) => key));
    const failedKeys = new Set<keyof AppSettings>();
    const persistedKeys = new Set<keyof AppSettings>();
    let hasNewerPendingSettings = false;
    for (let index = 0; index < results.length; index += 1) {
      const entry = entries[index];
      const result = results[index];
      if (!entry) continue;
      const [key, value] = entry;
      if (result?.status !== 'fulfilled') {
        failedKeys.add(key);
        continue;
      }
      persistedKeys.add(key);
      if (nextPending[key] === value) delete nextPending[key];
      else hasNewerPendingSettings = true;
    }
    let hasFailedWrite = false;
    for (const key of Object.keys(nextPending) as Array<keyof AppSettings>) {
      if (failedKeys.has(key)) {
        hasFailedWrite = true;
      } else if (!attemptedKeys.has(key) || !persistedKeys.has(key)) {
        hasNewerPendingSettings = true;
      }
    }
    pendingSettingsRef.current = nextPending;
    if (Object.keys(nextPending).length === 0) {
      persistenceRetryAttemptRef.current = 0;
      return;
    }
    if (hasNewerPendingSettings) {
      schedulePendingSettingsPersistence(client);
      return;
    }
    if (hasFailedWrite) {
      const retryDelayMs = Math.min(1000 * 2 ** persistenceRetryAttemptRef.current, 30000);
      persistenceRetryAttemptRef.current += 1;
      schedulePendingSettingsPersistence(client, retryDelayMs);
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
