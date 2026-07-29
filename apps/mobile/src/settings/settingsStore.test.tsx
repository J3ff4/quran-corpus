import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSettingsProvider, useAppSettings, type AppSettingsContextValue } from './settingsStore';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const originalConsoleError = console.error;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((message?: unknown, ...args: unknown[]) => {
    if (typeof message === 'string' && message.includes('react-test-renderer is deprecated')) return;
    originalConsoleError(message, ...args);
  });
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

function SettingsProbe({ onSettings }: { onSettings: (settings: AppSettingsContextValue) => void }) {
  onSettings(useAppSettings());
  return null;
}

function requireSettings(settings: AppSettingsContextValue | null): AppSettingsContextValue {
  if (!settings) throw new Error('Settings were not captured from AppSettingsProvider');
  return settings;
}

describe('AppSettingsProvider', () => {
  it('provides M1 settings and updates them through useAppSettings', () => {
    let settings: AppSettingsContextValue | null = null;

    act(() => {
      create(
        <AppSettingsProvider>
          <SettingsProbe onSettings={(nextSettings) => { settings = nextSettings; }} />
        </AppSettingsProvider>,
      );
    });

    let currentSettings = requireSettings(settings);
    expect(currentSettings.uiLocale).toBe('en');
    expect(currentSettings.contentLanguage).toBe('en');
    expect(currentSettings.analyticsEnabled).toBe(false);

    act(() => {
      currentSettings.setUiLocale('ru');
      currentSettings.setContentLanguage('uz');
      currentSettings.setAnalyticsEnabled(true);
    });

    currentSettings = requireSettings(settings);
    expect(currentSettings.uiLocale).toBe('ru');
    expect(currentSettings.contentLanguage).toBe('uz');
    expect(currentSettings.analyticsEnabled).toBe(true);
  });
});
