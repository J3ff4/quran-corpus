import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryUserClient } from '../data/userRepository.testHelpers';
import { getSetting, saveSetting } from '../data/userRepository';
import { AppSettingsProvider, useAppSettings, type AppSettingsContextValue } from './settingsStore';

const mocks = vi.hoisted(() => ({
  userClient: null as ReturnType<typeof createMemoryUserClient> | null,
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

vi.mock('../data/userDb', () => ({
  openUserDb: async () => mocks.userClient,
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
});

function requireSettingsClient() {
  if (!mocks.userClient) throw new Error('Settings test user client was not initialized');
  return mocks.userClient;
}
