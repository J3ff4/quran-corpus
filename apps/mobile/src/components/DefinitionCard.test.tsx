import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DefinitionCard } from './DefinitionCard';

vi.mock('@/theme/themeContext', () => ({
  useThemeColors: () => ({ text: '#000', mutedText: '#666', accent: '#1f6f5b', border: '#ccc', surface: '#fff' }),
}));
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));
vi.mock('@quran-corpus/data/mobile', () => ({
  definitionSourceLabel: (s: string) => (s === 'lane' ? "Lane's Lexicon" : s),
}));
// See reactNativeTextMock's doc comment in rnHosts.ts for why Text is built
// on host('span') plus a layout-handler registry rather than a bare mock: it
// is what makes this suite exercise the same testID/aria mapping as the
// component under test, and DefinitionCard renders its definition through
// ClampedText.
vi.mock('react-native', async () => {
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return reactNativeTextMock();
});

describe('DefinitionCard', () => {
  afterEach(cleanup);

  it('credits the source it was given', () => {
    render(<DefinitionCard uiLocale="en" definition="to say" source="lane" />);
    // .textContent, not the jest-dom toHaveTextContent matcher: jest-dom is an
    // apps/web dependency only (see EntryHeader.test.tsx).
    expect(screen.getByTestId('definition-source').textContent).toBe("Lane's Lexicon");
  });

  it('renders an unmapped tag as itself rather than uncredited', () => {
    // §11: this text is third-party licensed and must never render bare. A
    // visibly wrong credit beats a silently missing one.
    render(<DefinitionCard uiLocale="en" definition="to say" source="brand-new" />);
    expect(screen.getByTestId('definition-source').textContent).toBe('brand-new');
  });

  it('renders the definition through the clamp', () => {
    render(<DefinitionCard uiLocale="en" definition="to say" source="lane" />);
    expect(screen.getByTestId('clamp-body').textContent).toBe('to say');
  });
});
