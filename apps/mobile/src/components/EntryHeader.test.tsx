import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EntryHeader } from './EntryHeader';

vi.mock('@/theme/themeContext', () => ({
  useThemeColors: () => ({ text: '#000', mutedText: '#666', border: '#ccc', surface: '#fff' }),
}));
vi.mock('@/theme/useArabicSizes', () => ({ useArabicSizes: () => ({ title: 36 }) }));
vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return { Text: host('span'), View: host('div') };
});

describe('EntryHeader', () => {
  afterEach(cleanup);

  it('renders the headword as the screen heading', () => {
    render(<EntryHeader uiLocale="en" arabic="قول" count={12} />);
    // .textContent, not the jest-dom toHaveTextContent matcher: jest-dom is an
    // apps/web dependency only, and adding it here for one assertion would be
    // a new dependency on apps/mobile (forbidden without asking) when the
    // repo's own FrequencyList.test.tsx already covers this with .textContent.
    expect(screen.getByRole('heading').textContent).toBe('قول');
  });

  it('says how many occurrences, not a bare number', () => {
    render(<EntryHeader uiLocale="en" arabic="قول" count={1722} />);
    expect(screen.getByTestId('entry-count').textContent).toBe('1722 occurrences');
  });

  it('omits the transliteration line when there is none', () => {
    // Roots have no transliteration column; an empty line would leave a gap
    // between the headword and its pills.
    render(<EntryHeader uiLocale="en" arabic="قول" count={3} />);
    expect(screen.queryByTestId('entry-translit')).toBeNull();
  });

  it('shows the transliteration when there is one', () => {
    render(<EntryHeader uiLocale="en" arabic="قَالَ" transliteration="qāla" count={3} />);
    expect(screen.getByTestId('entry-translit').textContent).toBe('qāla');
  });

  it('collapses the chip row when the caller passes nothing', () => {
    render(<EntryHeader uiLocale="en" arabic="قول" count={3} />);
    expect(screen.queryByTestId('entry-chips')).toBeNull();
  });
});
