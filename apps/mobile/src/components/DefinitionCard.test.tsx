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
  // ClampedText pulls `t()` from '@/i18n/uiStrings', which reads this
  // constant at module scope for 'about.sourceAudio' -- unused by any
  // assertion here, but its absence from this mock throws at import time.
  AYAH_AUDIO_ATTRIBUTION: 'test attribution',
}));
vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  // See ClampedText.test.tsx for why Text is built on host('span') plus a
  // layout-handler registry rather than a bare mock: it is what makes this
  // suite exercise the same testID/aria mapping as the component under test,
  // and DefinitionCard renders its definition through ClampedText.
  const layoutHandlers = new Map<
    string,
    (event: { nativeEvent: { lines: { text: string }[] } }) => void
  >();
  const HostText = host('span');
  const Text = ({
    onTextLayout,
    ...rest
  }: Record<string, unknown> & {
    onTextLayout?: (event: { nativeEvent: { lines: { text: string }[] } }) => void;
    testID?: string;
  }) => {
    const testID = rest.testID as string | undefined;
    if (testID && onTextLayout) layoutHandlers.set(testID, onTextLayout);
    return React.createElement(HostText, rest);
  };
  return { Text, View: host('div'), Pressable: host('button'), __layoutHandlers: layoutHandlers };
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
