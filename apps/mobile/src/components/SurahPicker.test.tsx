import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const React = await import('react');
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return {
    ...reactNativeTextMock(),
    TextInput: ({ value, onChangeText, testID, accessibilityLabel }: Record<string, unknown>) =>
      React.createElement('input', {
        'data-testid': testID,
        'aria-label': accessibilityLabel,
        value: value as string,
        onChange: (event: { target: { value: string } }) =>
          (onChangeText as (next: string) => void)(event.target.value),
      }),
  };
});
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }),
}));
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }),
}));

import type { SurahListItem } from '@/data/corpusRepository';
import { SurahPicker } from './SurahPicker';

const SURAHS: SurahListItem[] = [
  { id: 1, nameArabic: 'الفاتحة', nameTranslit: 'Al-Fatihah', nameTranslation: 'The Opener', ayahCount: 7 },
  { id: 2, nameArabic: 'البقرة', nameTranslit: 'Al-Baqarah', nameTranslation: 'The Cow', ayahCount: 286 },
  { id: 36, nameArabic: 'يس', nameTranslit: 'Ya-Sin', nameTranslation: 'Ya Sin', ayahCount: 83 },
];

function renderPicker() {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(<SurahPicker surahs={SURAHS} uiLocale="en" onPick={onPick} onClose={onClose} />);
  return { onPick, onClose };
}

const type = (text: string) =>
  fireEvent.change(screen.getByTestId('surah-picker-filter'), { target: { value: text } });

describe('SurahPicker', () => {
  afterEach(cleanup);

  it('opens on the whole index, unfiltered', () => {
    renderPicker();
    expect(screen.getByText('Al-Fatihah')).toBeTruthy();
    expect(screen.getByText('Al-Baqarah')).toBeTruthy();
    expect(screen.getByText('Ya-Sin')).toBeTruthy();
  });

  it('narrows to the typed name', () => {
    renderPicker();
    type('baqara');
    expect(screen.getByText('Al-Baqarah')).toBeTruthy();
    expect(screen.queryByText('Al-Fatihah')).toBeNull();
  });

  it('hands the caller the surah id, and nothing else', () => {
    // The picker never navigates. Ruling R3 says a pick jumps to ayah 1, and
    // the three callers each mean something different by that.
    const { onPick } = renderPicker();
    type('yasin');
    fireEvent.click(screen.getByText('Ya-Sin'));
    expect(onPick).toHaveBeenCalledWith(36);
  });

  it('says so when nothing matches, rather than going blank', () => {
    renderPicker();
    type('zzzz');
    expect(screen.getByTestId('surah-picker-empty')).toBeTruthy();
    expect(screen.queryByText('Al-Fatihah')).toBeNull();
  });

  it('closes without picking', () => {
    const { onPick, onClose } = renderPicker();
    fireEvent.click(screen.getByTestId('surah-picker-close'));
    expect(onClose).toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });
});
