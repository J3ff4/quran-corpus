import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MobileDataClient } from '@quran-corpus/mobile-data';
import { createMemoryUserClient } from '../data/userRepository.testHelpers';
import { getSetting, saveSetting } from '../data/userRepository';
import { AppSettingsProvider, useAppSettings, type AppSettingsContextValue } from './settingsStore';

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

    await waitFor(() => expect(requireSettings(settings).uiLocale).toBe('uz'));
    await waitFor(async () => {
      await expect(getSetting(userClient, 'uiLocale')).resolves.toBe('uz');
    });
  });

  it('retries pending pre-hydration settings after a transient save failure', async () => {
    const userClient = requireSettingsClient();
    await saveSetting(userClient, 'uiLocale', 'ru');
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

    await waitFor(() => expect(requireSettings(settings).uiLocale).toBe('uz'));

    act(() => {
      requireSettings(settings).setAnalyticsEnabled(true);
    });

    await waitFor(async () => {
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
});

function requireSettingsClient() {
  if (!mocks.userClient) throw new Error('Settings test user client was not initialized');
  return mocks.userClient;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
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
