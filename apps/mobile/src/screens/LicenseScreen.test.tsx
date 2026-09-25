import { createHash } from 'node:crypto';
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GPL_2_0_TEXT } from '../licenses/gpl-2.0';
import { LicenseScreen } from './LicenseScreen';

// The store opens the user DB through expo-sqlite; every screen suite stubs
// it the same way (see AboutTab.test.tsx).
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en' }),
}));

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

describe('LicenseScreen', () => {
  afterEach(cleanup);

  it('carries the FSF text byte for byte', () => {
    // A hash, not a phrase. "Verbatim" is the whole legal requirement and a
    // phrase check passes on a text with a clause deleted -- which is the
    // shape of failure a generated file actually has.
    expect(createHash('sha256').update(GPL_2_0_TEXT, 'utf8').digest('hex')).toBe(
      'edaef632cbb643e4e7a221717a6c441a4c1a7c918e6e4d56debc3d8739b233f6',
    );
  });

  it('renders the licence body, not a summary of it', () => {
    render(<LicenseScreen />);
    // The operative clause. A screen that paraphrases the GPL does not
    // discharge the obligation, so assert on text only the real licence has.
    const body = screen.getByTestId('license-body').textContent ?? '';
    expect(body).toContain('GNU GENERAL PUBLIC LICENSE');
    expect(body).toContain('you must give the recipients all the rights that');
  });

  it('is selectable, so the text can be copied off the device', () => {
    render(<LicenseScreen />);
    // .getAttribute, not the jest-dom toHaveAttribute matcher: jest-dom is not
    // installed in this app (see the same note in DictionaryRow.test.tsx).
    expect(screen.getByTestId('license-body').getAttribute('data-selectable')).toBe('true');
  });
});
