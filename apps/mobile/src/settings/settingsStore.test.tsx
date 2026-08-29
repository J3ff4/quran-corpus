import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileDataClient } from '@quran-corpus/mobile-data';
import { DEFAULT_RECITER_ID } from '@quran-corpus/data/mobile';
import { createMemoryUserClient } from '../data/userRepository.testHelpers';
import { getSetting, saveSetting } from '../data/userRepository';
import {
  AppSettingsProvider,
  loadPersistedAppSettings,
  useAppSettings,
  type AppSettingsContextValue,
} from './settingsStore';
import { deferred } from '../testing/deferred';

const mocks = vi.hoisted(() => ({
  userClient: null as ReturnType<typeof createMemoryUserClient> | null,
  openUserDb: null as (() => Promise<ReturnType<typeof createMemoryUserClient> | null>) | null,
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

vi.mock('../data/userDb', () => ({
  openUserDb: async () => (mocks.openUserDb ? mocks.openUserDb() : mocks.userClient),
}));

function SettingsProbe({ onSettings }: { onSettings: (settings: AppSettingsContextValue) => void }) {
  onSettings(useAppSettings());
  return null;
}

function requireSettings(settings: AppSettingsContextValue | null): AppSettingsContextValue {
  if (!settings) throw new Error('Settings were not captured from AppSettingsProvider');
  return settings;
}

describe('AppSettingsProvider', () => {
  beforeEach(() => {
    mocks.userClient = createMemoryUserClient();
    mocks.openUserDb = null;
  });

  afterEach(() => {
    // Cases below leave a scheduled 30 s retry alive; clearing before swapping
    // back to real timers keeps it from firing into the next test's client.
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('hydrates persisted settings and writes setting changes through useAppSettings', async () => {
    const userClient = requireSettingsClient();
    await saveSetting(userClient, 'uiLocale', 'ru');
    await saveSetting(userClient, 'contentLanguage', 'uz');

    let settings: AppSettingsContextValue | null = null;
    render(
      <AppSettingsProvider>
        <SettingsProbe onSettings={(nextSettings) => { settings = nextSettings; }} />
      </AppSettingsProvider>,
    );

    await waitFor(() => expect(requireSettings(settings).uiLocale).toBe('ru'));
    expect(requireSettings(settings).contentLanguage).toBe('uz');

    act(() => {
      requireSettings(settings).setAnalyticsEnabled(true);
    });

    await waitFor(async () => {
      await expect(getSetting(userClient, 'analyticsEnabled')).resolves.toBe('true');
    });
  });

  it('preserves and persists setting changes made before hydration finishes', async () => {
    const userClient = requireSettingsClient();
    await saveSetting(userClient, 'uiLocale', 'ru');
    const openDeferred = deferred<ReturnType<typeof createMemoryUserClient> | null>();
    mocks.openUserDb = () => openDeferred.promise;

    let settings: AppSettingsContextValue | null = null;
    render(
      <AppSettingsProvider>
        <SettingsProbe onSettings={(nextSettings) => { settings = nextSettings; }} />
      </AppSettingsProvider>,
    );

    act(() => {
      requireSettings(settings).setUiLocale('uz');
    });
    openDeferred.resolve(userClient);

    await vi.waitFor(() => expect(requireSettings(settings).uiLocale).toBe('uz'));
    await vi.waitFor(async () => {
      await expect(getSetting(userClient, 'uiLocale')).resolves.toBe('uz');
    });
  });

  it('retries pending pre-hydration settings after a transient save failure', async () => {
    const userClient = requireSettingsClient();
    await saveSetting(userClient, 'uiLocale', 'ru');
    vi.useFakeTimers();
    const flakyClient = failFirstSettingWrite(userClient, 'uiLocale');
    const openDeferred = deferred<MobileDataClient>();
    mocks.openUserDb = () => openDeferred.promise as Promise<ReturnType<typeof createMemoryUserClient>>;

    let settings: AppSettingsContextValue | null = null;
    render(
      <AppSettingsProvider>
        <SettingsProbe onSettings={(nextSettings) => { settings = nextSettings; }} />
      </AppSettingsProvider>,
    );

    act(() => {
      requireSettings(settings).setUiLocale('uz');
    });
    openDeferred.resolve(flakyClient);

    await vi.waitFor(() => expect(requireSettings(settings).uiLocale).toBe('uz'));

    act(() => {
      requireSettings(settings).setAnalyticsEnabled(true);
    });

    // Fake timers, matching the sibling backoff cases. This used to be a real
    // 1.1s sleep hard-coded against the 1000ms retry constant: slow, prone to
    // flaking on a loaded runner, and it silently stopped exercising the retry
    // at all if that constant ever grew.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await vi.waitFor(async () => {
      await expect(getSetting(userClient, 'uiLocale')).resolves.toBe('uz');
    });
  });

  it('serializes pending setting writes so older batches cannot overwrite newer values', async () => {
    const userClient = requireSettingsClient();
    const firstWrite = deferred<void>();
    const firstWriteStarted = deferred<void>();
    const firstWriteFinished = deferred<void>();
    const delayedClient = delayFirstSettingWrite(userClient, 'uiLocale', {
      release: firstWrite.promise,
      started: firstWriteStarted.resolve,
      finished: firstWriteFinished.resolve,
    });
    const openDeferred = deferred<MobileDataClient>();
    mocks.openUserDb = () => openDeferred.promise as Promise<ReturnType<typeof createMemoryUserClient>>;

    let settings: AppSettingsContextValue | null = null;
    render(
      <AppSettingsProvider>
        <SettingsProbe onSettings={(nextSettings) => { settings = nextSettings; }} />
      </AppSettingsProvider>,
    );

    act(() => {
      requireSettings(settings).setUiLocale('uz');
    });
    openDeferred.resolve(delayedClient);
    await firstWriteStarted.promise;

    act(() => {
      requireSettings(settings).setUiLocale('ru');
    });

    firstWrite.resolve();
    await firstWriteFinished.promise;

    await waitFor(async () => {
      await expect(getSetting(userClient, 'uiLocale')).resolves.toBe('ru');
    });
  });

  it('backs off retrying persistent pending setting failures', async () => {
    vi.useFakeTimers();
    const userClient = requireSettingsClient();
    const flakyClient = failSettingWrites(userClient, 'uiLocale', 2);
    const openDeferred = deferred<MobileDataClient>();
    mocks.openUserDb = () => openDeferred.promise as Promise<ReturnType<typeof createMemoryUserClient>>;

    let settings: AppSettingsContextValue | null = null;
    render(
      <AppSettingsProvider>
        <SettingsProbe onSettings={(nextSettings) => { settings = nextSettings; }} />
      </AppSettingsProvider>,
    );

    act(() => {
      requireSettings(settings).setUiLocale('uz');
    });
    openDeferred.resolve(flakyClient);

    await vi.waitFor(() => expect(flakyClient.settingWriteAttempts()).toBe(1));
    await Promise.resolve();
    await Promise.resolve();
    expect(flakyClient.settingWriteAttempts()).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await vi.waitFor(() => expect(flakyClient.settingWriteAttempts()).toBe(2));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    await vi.waitFor(async () => {
      await expect(getSetting(userClient, 'uiLocale')).resolves.toBe('uz');
    });
    expect(flakyClient.settingWriteAttempts()).toBe(3);
  });

  it('does not retry pending setting writes after unmount', async () => {
    vi.useFakeTimers();
    const userClient = requireSettingsClient();
    const writeRelease = deferred<void>();
    const firstWriteStarted = deferred<void>();
    const rejectingClient = rejectFirstSettingWrite(userClient, 'uiLocale', {
      release: writeRelease.promise,
      started: firstWriteStarted.resolve,
    });
    const openDeferred = deferred<MobileDataClient>();
    mocks.openUserDb = () => openDeferred.promise as Promise<ReturnType<typeof createMemoryUserClient>>;

    let settings: AppSettingsContextValue | null = null;
    const view = render(
      <AppSettingsProvider>
        <SettingsProbe onSettings={(nextSettings) => { settings = nextSettings; }} />
      </AppSettingsProvider>,
    );

    act(() => {
      requireSettings(settings).setUiLocale('uz');
    });
    openDeferred.resolve(rejectingClient);
    await firstWriteStarted.promise;

    view.unmount();
    writeRelease.reject(new Error('settings write after unmount'));
    await Promise.resolve();
    await Promise.resolve();

    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(rejectingClient.settingWriteAttempts()).toBe(1);
  });

  it('does not run already queued setting writes after unmount', async () => {
    const userClient = requireSettingsClient();
    await saveSetting(userClient, 'uiLocale', 'ru');
    const writeRelease = deferred<void>();
    const firstWriteStarted = deferred<void>();
    const delayedClient = delayFirstSettingWrite(userClient, 'uiLocale', {
      release: writeRelease.promise,
      started: firstWriteStarted.resolve,
      finished: () => undefined,
    });
    const countingClient = countSettingWrites(delayedClient, 'uiLocale');
    const openDeferred = deferred<MobileDataClient>();
    mocks.openUserDb = () => openDeferred.promise as Promise<ReturnType<typeof createMemoryUserClient>>;

    let settings: AppSettingsContextValue | null = null;
    const view = render(
      <AppSettingsProvider>
        <SettingsProbe onSettings={(nextSettings) => { settings = nextSettings; }} />
      </AppSettingsProvider>,
    );

    openDeferred.resolve(countingClient);
    await waitFor(() => expect(requireSettings(settings).uiLocale).toBe('ru'));

    act(() => {
      requireSettings(settings).setUiLocale('uz');
    });
    await firstWriteStarted.promise;

    act(() => {
      requireSettings(settings).setUiLocale('en');
    });
    view.unmount();
    writeRelease.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(countingClient.settingWriteAttempts()).toBe(1);
  });

  it('persists newer queued values immediately when an older write fails', async () => {
    vi.useFakeTimers();
    const userClient = requireSettingsClient();
    const writeRelease = deferred<void>();
    const firstWriteStarted = deferred<void>();
    const flakyClient = rejectFirstSettingWrite(userClient, 'uiLocale', {
      release: writeRelease.promise,
      started: firstWriteStarted.resolve,
    });
    const openDeferred = deferred<MobileDataClient>();
    mocks.openUserDb = () => openDeferred.promise as Promise<ReturnType<typeof createMemoryUserClient>>;

    let settings: AppSettingsContextValue | null = null;
    render(
      <AppSettingsProvider>
        <SettingsProbe onSettings={(nextSettings) => { settings = nextSettings; }} />
      </AppSettingsProvider>,
    );

    act(() => {
      requireSettings(settings).setUiLocale('uz');
    });
    openDeferred.resolve(flakyClient);
    await firstWriteStarted.promise;

    act(() => {
      requireSettings(settings).setUiLocale('ru');
    });
    writeRelease.reject(new Error('stale settings write failed'));
    await Promise.resolve();
    await Promise.resolve();

    await vi.waitFor(async () => {
      await expect(getSetting(userClient, 'uiLocale')).resolves.toBe('ru');
    });
    expect(flakyClient.settingWriteAttempts()).toBe(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not bypass retry backoff for unrelated setting changes', async () => {
    vi.useFakeTimers();
    const userClient = requireSettingsClient();
    const flakyClient = failSettingWrites(userClient, 'uiLocale', 1);
    const openDeferred = deferred<MobileDataClient>();
    mocks.openUserDb = () => openDeferred.promise as Promise<ReturnType<typeof createMemoryUserClient>>;

    let settings: AppSettingsContextValue | null = null;
    render(
      <AppSettingsProvider>
        <SettingsProbe onSettings={(nextSettings) => { settings = nextSettings; }} />
      </AppSettingsProvider>,
    );

    act(() => {
      requireSettings(settings).setUiLocale('uz');
    });
    openDeferred.resolve(flakyClient);

    await vi.waitFor(() => expect(flakyClient.settingWriteAttempts()).toBe(1));
    await Promise.resolve();
    await Promise.resolve();

    act(() => {
      requireSettings(settings).setTheme('dark');
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(flakyClient.settingWriteAttempts()).toBe(1);
    await expect(getSetting(userClient, 'theme')).resolves.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await vi.waitFor(async () => {
      await expect(getSetting(userClient, 'uiLocale')).resolves.toBe('uz');
      await expect(getSetting(userClient, 'theme')).resolves.toBe('dark');
    });
    expect(flakyClient.settingWriteAttempts()).toBe(2);
  });

  it('refuses to store a reciter that is not in the shared table', async () => {
    // The read side already falls back, but a value set at runtime is live for
    // the rest of the session, and it is read straight into a URL builder.
    const userClient = requireSettingsClient();
    const refused = vi.spyOn(console, 'error').mockImplementation(() => {});
    let settings: AppSettingsContextValue | null = null;
    render(
      <AppSettingsProvider>
        <SettingsProbe onSettings={(nextSettings) => { settings = nextSettings; }} />
      </AppSettingsProvider>,
    );
    await waitFor(() => expect(requireSettings(settings).reciterId).toBe(DEFAULT_RECITER_ID));

    act(() => {
      requireSettings(settings).setReciterId('alafasy');
    });

    expect(requireSettings(settings).reciterId).toBe(DEFAULT_RECITER_ID);
    await expect(getSetting(userClient, 'reciterId')).resolves.toBeNull();
    expect(refused).toHaveBeenCalled();
    refused.mockRestore();
  });

  it('persists a reciter the table knows', async () => {
    const userClient = requireSettingsClient();
    let settings: AppSettingsContextValue | null = null;
    render(
      <AppSettingsProvider>
        <SettingsProbe onSettings={(nextSettings) => { settings = nextSettings; }} />
      </AppSettingsProvider>,
    );
    await waitFor(() => expect(requireSettings(settings).reciterId).toBe(DEFAULT_RECITER_ID));

    act(() => {
      requireSettings(settings).setReciterId('sudais');
    });

    await waitFor(async () => {
      await expect(getSetting(userClient, 'reciterId')).resolves.toBe('sudais');
    });
  });
});

describe('loadPersistedAppSettings', () => {
  beforeEach(() => {
    mocks.userClient = createMemoryUserClient();
  });

  it('round-trips a chosen Arabic step', async () => {
    const userClient = requireSettingsClient();
    await saveSetting(userClient, 'arabicScale', 'large');

    const settings = await loadPersistedAppSettings(userClient);

    expect(settings.arabicScale).toBe('large');
  });

  it('rejects a stored arabicScale that is not a step', async () => {
    // Straight into a font size if it got through, and RN throws on NaN.
    const userClient = requireSettingsClient();
    await saveSetting(userClient, 'arabicScale', 'enormous');

    const settings = await loadPersistedAppSettings(userClient);

    expect(settings.arabicScale).toBe('medium');
  });

  it('round-trips a chosen reciter', async () => {
    const userClient = requireSettingsClient();
    await saveSetting(userClient, 'reciterId', 'sudais');

    const settings = await loadPersistedAppSettings(userClient);

    expect(settings.reciterId).toBe('sudais');
  });

  it('falls back to the default for an unknown stored reciter', async () => {
    // Same class as readerMode, and worse: this value becomes a path segment
    // in the audio URL. 'alafasy' is a real everyayah folder the owner ruled
    // out (decision 37), and 'Husary_64kbps' is a folder rather than an id --
    // a guard that checked the wrong column would let it through.
    for (const stored of ['alafasy', '', '../..', 'Husary_64kbps']) {
      const userClient = createMemoryUserClient();
      await saveSetting(userClient, 'reciterId', stored);

      const settings = await loadPersistedAppSettings(userClient);

      expect(settings.reciterId, `stored ${JSON.stringify(stored)}`).toBe(DEFAULT_RECITER_ID);
    }
  });

  it('reads reduceMotion as on only for the exact stored "true"', async () => {
    // String(false) is 'false', which is truthy. This setting gates every
    // animation in the app, so a stored off must not read as on.
    const userClient = requireSettingsClient();
    await saveSetting(userClient, 'reduceMotion', 'false');

    await expect(loadPersistedAppSettings(userClient)).resolves.toMatchObject({ reduceMotion: false });

    await saveSetting(userClient, 'reduceMotion', 'true');

    await expect(loadPersistedAppSettings(userClient)).resolves.toMatchObject({ reduceMotion: true });
  });

  it('reads continuousPlay as on only for the exact stored "true"', async () => {
    // Same String(value) hazard reduceMotion documents above, on a setting the
    // reader now takes as the only source of truth: useRecitation holds no copy
    // of its own, so a stored off that read as on would run the whole surah.
    const userClient = requireSettingsClient();
    await saveSetting(userClient, 'continuousPlay', 'false');

    await expect(loadPersistedAppSettings(userClient)).resolves.toMatchObject({ continuousPlay: false });

    await saveSetting(userClient, 'continuousPlay', 'true');

    await expect(loadPersistedAppSettings(userClient)).resolves.toMatchObject({ continuousPlay: true });
  });

  it('restores a persisted reader mode', async () => {
    const userClient = requireSettingsClient();
    await saveSetting(userClient, 'readerMode', 'mushaf');

    const settings = await loadPersistedAppSettings(userClient);

    expect(settings.readerMode).toBe('mushaf');
  });

  it('falls back to translation for a readerMode it does not recognise', async () => {
    // Same keyed-not-positional hazard this file already documents: an
    // unvalidated read puts an arbitrary stored string into the reader's mode
    // switch, which renders neither branch. 'wbw' is in the list because it is
    // the plausible one -- it is a real mode chip segment, and it is precisely
    // the value that must not be stored, since reopening onto the screen the
    // user left by pressing back is not a restore.
    const userClient = requireSettingsClient();
    for (const bad of ['wbw', 'MUSHAF', '', 'null']) {
      await saveSetting(userClient, 'readerMode', bad);

      const settings = await loadPersistedAppSettings(userClient);

      expect(settings.readerMode).toBe('translation');
    }
  });

  it('restores a persisted word-by-word density', async () => {
    const userClient = requireSettingsClient();
    await saveSetting(userClient, 'wbwDensity', 'dense');

    const settings = await loadPersistedAppSettings(userClient);

    expect(settings.wbwDensity).toBe('dense');
  });

  it('falls back to hybrid for a wbwDensity it does not recognise', async () => {
    // '2c' and '2d' are in the list because they are the mockup names the
    // plan and every commit body use, and so the plausible thing for a later
    // writer to store. An unvalidated read hands the layout switch a value
    // that renders neither layout.
    const userClient = requireSettingsClient();
    for (const bad of ['2c', '2d', 'DENSE', '', 'compact']) {
      await saveSetting(userClient, 'wbwDensity', bad);

      const settings = await loadPersistedAppSettings(userClient);

      expect(settings.wbwDensity).toBe('hybrid');
    }
  });

  it('rejects an arabicScale that only names a property of Object.prototype', async () => {
    // `value in arabicScales` would accept this and hand `toString` to the
    // multiply, which is NaN. Object.hasOwn is why it does not.
    const userClient = requireSettingsClient();
    await saveSetting(userClient, 'arabicScale', 'toString');

    const settings = await loadPersistedAppSettings(userClient);

    expect(settings.arabicScale).toBe('medium');
  });
});

function requireSettingsClient() {
  if (!mocks.userClient) throw new Error('Settings test user client was not initialized');
  return mocks.userClient;
}


function failFirstSettingWrite(client: MobileDataClient, keyToFail: string): MobileDataClient {
  let failed = false;
  return {
    async execute(statement) {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      const args = typeof statement === 'string' ? [] : (statement.args ?? []);
      if (!failed && sql.startsWith('INSERT INTO settings') && args[0] === keyToFail) {
        failed = true;
        throw new Error('transient settings write failure');
      }
      return client.execute(statement);
    },
  };
}

function failSettingWrites(client: MobileDataClient, keyToFail: string, failures: number): MobileDataClient & { settingWriteAttempts: () => number } {
  let attempts = 0;
  return {
    settingWriteAttempts: () => attempts,
    async execute(statement) {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      const args = typeof statement === 'string' ? [] : (statement.args ?? []);
      if (sql.startsWith('INSERT INTO settings') && args[0] === keyToFail) {
        attempts += 1;
        if (attempts <= failures) throw new Error('persistent settings write failure');
      }
      return client.execute(statement);
    },
  };
}

function delayFirstSettingWrite(
  client: MobileDataClient,
  keyToDelay: string,
  hooks: { release: Promise<void>; started: () => void; finished: () => void },
): MobileDataClient {
  let delayed = false;
  return {
    async execute(statement) {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      const args = typeof statement === 'string' ? [] : (statement.args ?? []);
      if (!delayed && sql.startsWith('INSERT INTO settings') && args[0] === keyToDelay) {
        delayed = true;
        hooks.started();
        await hooks.release;
        const result = await client.execute(statement);
        hooks.finished();
        return result;
      }
      return client.execute(statement);
    },
  };
}

function rejectFirstSettingWrite(
  client: MobileDataClient,
  keyToReject: string,
  hooks: { release: Promise<void>; started: () => void },
): MobileDataClient & { settingWriteAttempts: () => number } {
  let attempts = 0;
  return {
    settingWriteAttempts: () => attempts,
    async execute(statement) {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      const args = typeof statement === 'string' ? [] : (statement.args ?? []);
      if (sql.startsWith('INSERT INTO settings') && args[0] === keyToReject) {
        attempts += 1;
        if (attempts === 1) {
          hooks.started();
          await hooks.release;
        }
      }
      return client.execute(statement);
    },
  };
}

function countSettingWrites(
  client: MobileDataClient,
  keyToCount: string,
): MobileDataClient & { settingWriteAttempts: () => number } {
  let attempts = 0;
  return {
    settingWriteAttempts: () => attempts,
    async execute(statement) {
      const sql = typeof statement === 'string' ? statement : statement.sql;
      const args = typeof statement === 'string' ? [] : (statement.args ?? []);
      if (sql.startsWith('INSERT INTO settings') && args[0] === keyToCount) attempts += 1;
      return client.execute(statement);
    },
  };
}
