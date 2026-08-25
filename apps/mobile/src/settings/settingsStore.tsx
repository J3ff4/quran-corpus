import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createExpoSqliteClient, type ExpoSqliteLike, type MobileDataClient } from '@quran-corpus/mobile-data';
import { contentLanguages, uiLocales, type ContentLanguageCode, type UiLocaleCode } from '../i18n/languages';
import { openUserDb } from '../data/userDb';
import { getSetting, saveSetting } from '../data/userRepository';
import { arabicScales, type ArabicScale } from '../theme/tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

// Two values, not three. 'wbw' is a navigation, not a rendering -- the chip's
// third segment pushes /surah/[id]/words -- so persisting it would reopen the
// app onto a screen the user left by pressing back.
export type ReaderMode = 'mushaf' | 'translation';

// Global, not per-screen (decision 26): the density is a reading preference,
// and a reader who wants dense wants it in every surah.
export type WbwDensity = 'hybrid' | 'dense';

export interface AppSettings {
  uiLocale: UiLocaleCode;
  contentLanguage: ContentLanguageCode;
  theme: ThemePreference;
  analyticsEnabled: boolean;
  arabicScale: ArabicScale;
  reduceMotion: boolean;
  readerMode: ReaderMode;
  wbwDensity: WbwDensity;
}

export interface AppSettingsContextValue extends AppSettings {
  setUiLocale: (locale: UiLocaleCode) => void;
  setContentLanguage: (language: ContentLanguageCode) => void;
  setTheme: (theme: ThemePreference) => void;
  setAnalyticsEnabled: (enabled: boolean) => void;
  setArabicScale: (scale: ArabicScale) => void;
  setReduceMotion: (reduce: boolean) => void;
  setReaderMode: (mode: ReaderMode) => void;
  setWbwDensity: (density: WbwDensity) => void;
  /** Set while the settings database cannot be opened, so a screen can say so
   *  instead of letting changes look saved when nothing is being persisted. */
  storageError: string | null;
}

const defaultSettings: AppSettings = {
  uiLocale: 'en',
  contentLanguage: 'en',
  theme: 'system',
  analyticsEnabled: false,
  arabicScale: 'medium',
  reduceMotion: false,
  readerMode: 'translation',
  wbwDensity: 'hybrid',
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

// No fontScale here: Android's system font-size setting already scales every
// <Text> (allowFontScaling defaults to true), so an in-app duplicate was a
// second source of truth for the same thing. It was persisted but read by
// nothing and never surfaced in Settings, so no installed build can have a
// stored value to migrate.
//
// arabicScale is NOT that setting coming back. fontScale duplicated the OS
// control, which scales every <Text> alike. This one scales the Arabic
// *relative to* the UI text, which is the one ratio the OS control cannot
// change -- the owner's report was that the Arabic dominated the card at any
// system size. System scaling still composes on top; nothing here sets
// allowFontScaling.
const settingKeys = ['uiLocale', 'contentLanguage', 'theme', 'analyticsEnabled', 'arabicScale', 'reduceMotion', 'readerMode', 'wbwDensity'] as const;

function isUiLocale(value: string | null): value is UiLocaleCode {
  return uiLocales.some((locale) => locale.code === value);
}

function isContentLanguage(value: string | null): value is ContentLanguageCode {
  return contentLanguages.some((language) => language.code === value);
}

function isTheme(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isArabicScale(value: string | null): value is ArabicScale {
  return value !== null && Object.hasOwn(arabicScales, value);
}

function isReaderMode(value: string | null): value is ReaderMode {
  return value === 'mushaf' || value === 'translation';
}

function isWbwDensity(value: string | null): value is WbwDensity {
  return value === 'hybrid' || value === 'dense';
}

export async function loadPersistedAppSettings(client: MobileDataClient): Promise<AppSettings> {
  // Keyed, not positional. This used to destructure the Promise.all result by
  // index, which is correct only as long as nobody reorders settingKeys or
  // inserts a key in the middle. Doing either would have silently fed the theme
  // value to the locale validator, which rejects it and falls back to the
  // default -- a settings reset with no error, and every value is a plain
  // string so the tests would still have passed.
  const entries = await Promise.all(
    settingKeys.map(async (key) => [key, (await getSetting(client, key)) ?? null] as const),
  );
  const persisted = Object.fromEntries(entries) as Record<(typeof settingKeys)[number], string | null>;
  const persistedUiLocale = persisted.uiLocale;
  const persistedContentLanguage = persisted.contentLanguage;
  const persistedTheme = persisted.theme;
  const analyticsEnabled = persisted.analyticsEnabled;
  const persistedArabicScale = persisted.arabicScale;
  const reduceMotion = persisted.reduceMotion;
  const persistedReaderMode = persisted.readerMode;
  const persistedWbwDensity = persisted.wbwDensity;

  return {
    uiLocale: isUiLocale(persistedUiLocale) ? persistedUiLocale : defaultSettings.uiLocale,
    contentLanguage: isContentLanguage(persistedContentLanguage) ? persistedContentLanguage : defaultSettings.contentLanguage,
    theme: isTheme(persistedTheme) ? persistedTheme : defaultSettings.theme,
    analyticsEnabled: analyticsEnabled === 'true',
    arabicScale: isArabicScale(persistedArabicScale) ? persistedArabicScale : defaultSettings.arabicScale,
    reduceMotion: reduceMotion === 'true',
    readerMode: isReaderMode(persistedReaderMode) ? persistedReaderMode : defaultSettings.readerMode,
    wbwDensity: isWbwDensity(persistedWbwDensity) ? persistedWbwDensity : defaultSettings.wbwDensity,
  };
}

function settingValue(value: AppSettings[keyof AppSettings]): string {
  return String(value);
}

type PendingSettingEntry = [keyof AppSettings, AppSettings[keyof AppSettings]];

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [userClient, setUserClient] = useState<MobileDataClient | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const pendingSettingsRef = useRef<Partial<AppSettings>>({});
  const pendingPersistenceRef = useRef<Promise<void>>(Promise.resolve());
  const pendingImmediatePersistenceRef = useRef(false);
  const persistenceRetryAttemptRef = useRef(0);
  const persistenceRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryPendingSettingsRef = useRef<Partial<AppSettings> | null>(null);
  const persistenceSchedulerActiveRef = useRef(false);

  useEffect(() => {
    persistenceSchedulerActiveRef.current = true;
    let cancelled = false;
    let hydrationAttempt = 0;
    let hydrationTimer: ReturnType<typeof setTimeout> | null = null;

    async function hydrateSettings() {
      const db = await openUserDb();
      const client = createExpoSqliteClient(db as ExpoSqliteLike);
      const persisted = await loadPersistedAppSettings(client);
      if (!cancelled) {
        const pendingSettings = { ...pendingSettingsRef.current };
        setUserClient(client);
        setSettings({ ...persisted, ...pendingSettings });
        setStorageError(null);
        schedulePendingSettingsPersistence(client);
      }
    }

    // Retried, and surfaced. A rejected open used to be swallowed here, which
    // left userClient null forever -- so updateSetting took the queue-only
    // branch on every later change, and each one sat in pendingSettingsRef with
    // no client, no scheduler, no retry and nothing on screen. The user changed
    // a setting, watched it apply, restarted, and found it reverted. The retry
    // machinery below covers failed *writes*; this covers the failed open.
    function attemptHydration() {
      hydrateSettings().catch((cause) => {
        if (cancelled) return;
        setStorageError(cause instanceof Error ? cause.message : 'Unable to open settings storage');
        const retryDelayMs = Math.min(1000 * 2 ** hydrationAttempt, 30000);
        hydrationAttempt += 1;
        hydrationTimer = setTimeout(() => {
          hydrationTimer = null;
          if (!cancelled) attemptHydration();
        }, retryDelayMs);
      });
    }

    attemptHydration();
    return () => {
      cancelled = true;
      persistenceSchedulerActiveRef.current = false;
      if (hydrationTimer) {
        clearTimeout(hydrationTimer);
        hydrationTimer = null;
      }
      if (persistenceRetryTimerRef.current) {
        clearTimeout(persistenceRetryTimerRef.current);
        persistenceRetryTimerRef.current = null;
      }
      retryPendingSettingsRef.current = null;
    };
  }, []);

  function updateSetting<TKey extends keyof AppSettings>(key: TKey, value: AppSettings[TKey]) {
    setSettings((current) => ({ ...current, [key]: value }));
    // Queue unconditionally: with no client yet, hydration drains the queue
    // once it opens one.
    queuePendingSetting(key, value);
    if (userClient) schedulePendingSettingsPersistence(userClient);
  }

  function queuePendingSetting<TKey extends keyof AppSettings>(key: TKey, value: AppSettings[TKey]) {
    pendingSettingsRef.current = { ...pendingSettingsRef.current, [key]: value };
  }

  function hasSupersededRetryPendingSettings() {
    const retryPendingSettings = retryPendingSettingsRef.current;
    if (!retryPendingSettings) return true;
    const entries = Object.entries(retryPendingSettings) as PendingSettingEntry[];
    return entries.some(([key, value]) => (
      !Object.prototype.hasOwnProperty.call(pendingSettingsRef.current, key)
      || pendingSettingsRef.current[key] !== value
    ));
  }

  function schedulePendingSettingsPersistence(client: MobileDataClient, delayMs = 0) {
    if (!persistenceSchedulerActiveRef.current) return;
    if (delayMs > 0) {
      if (persistenceRetryTimerRef.current) clearTimeout(persistenceRetryTimerRef.current);
      retryPendingSettingsRef.current = { ...pendingSettingsRef.current };
      persistenceRetryTimerRef.current = setTimeout(() => {
        persistenceRetryTimerRef.current = null;
        retryPendingSettingsRef.current = null;
        if (!persistenceSchedulerActiveRef.current) return;
        schedulePendingSettingsPersistence(client);
      }, delayMs);
      return;
    }
    if (persistenceRetryTimerRef.current) {
      if (!hasSupersededRetryPendingSettings()) return;
      clearTimeout(persistenceRetryTimerRef.current);
      persistenceRetryTimerRef.current = null;
      retryPendingSettingsRef.current = null;
    }
    if (pendingImmediatePersistenceRef.current) return;
    pendingImmediatePersistenceRef.current = true;
    pendingPersistenceRef.current = pendingPersistenceRef.current
      .catch(() => undefined)
      .then(() => {
        pendingImmediatePersistenceRef.current = false;
        if (!persistenceSchedulerActiveRef.current) return;
        return persistPendingSettings(client, { ...pendingSettingsRef.current });
      });
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
        if (
          Object.prototype.hasOwnProperty.call(nextPending, key)
          && nextPending[key] !== value
        ) {
          hasNewerPendingSettings = true;
        }
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
    // A write that lands proves the store is reachable again, so a later
    // failure should not inherit the exponent an earlier failure streak built
    // up. Without this a single bad patch could keep every subsequent retry
    // near the 30 s cap for the rest of the session, even after several
    // successful writes in between. The drained-queue branch below resets too,
    // for the case where every entry was superseded and none was written.
    if (persistedKeys.size > 0) persistenceRetryAttemptRef.current = 0;

    pendingSettingsRef.current = nextPending;
    if (Object.keys(nextPending).length === 0) {
      persistenceRetryAttemptRef.current = 0;
      retryPendingSettingsRef.current = null;
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
      storageError,
      setUiLocale: (uiLocale) => updateSetting('uiLocale', uiLocale),
      setContentLanguage: (contentLanguage) => updateSetting('contentLanguage', contentLanguage),
      setTheme: (theme) => updateSetting('theme', theme),
      setAnalyticsEnabled: (analyticsEnabled) => updateSetting('analyticsEnabled', analyticsEnabled),
      setArabicScale: (arabicScale) => updateSetting('arabicScale', arabicScale),
      setReduceMotion: (reduceMotion) => updateSetting('reduceMotion', reduceMotion),
      setReaderMode: (readerMode) => updateSetting('readerMode', readerMode),
      setWbwDensity: (wbwDensity) => updateSetting('wbwDensity', wbwDensity),
    }),
    [settings, storageError, userClient],
  );

  return <AppSettingsContext.Provider value={value}>{children}</AppSettingsContext.Provider>;
}

export function useAppSettings(): AppSettingsContextValue {
  const value = useContext(AppSettingsContext);
  if (!value) throw new Error('useAppSettings must be used inside AppSettingsProvider');
  return value;
}
