import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SurahList } from './SurahList';

vi.mock('react-native', async () => {
  const React = await import('react');
  const host =
    (tag: string) =>
    ({ accessibilityRole, accessibilityLabel, children, onPress, ...props }: {
      accessibilityRole?: string;
      accessibilityLabel?: string;
      children?: React.ReactNode;
      onPress?: () => void;
    }) =>
      React.createElement(
        tag,
        {
          ...props,
          'aria-label': accessibilityLabel,
          onClick: onPress,
          role: accessibilityRole,
        },
        children,
      );

  return {
    FlatList: ({
      data,
      renderItem,
      keyExtractor,
    }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      keyExtractor?: (item: unknown, index: number) => string;
    }) =>
      React.createElement(
        'div',
        null,
        data.map((item, index) =>
          React.createElement('div', { key: keyExtractor?.(item, index) ?? index }, renderItem({ item, index })),
        ),
      ),
    Pressable: host('button'),
    Text: host('span'),
    View: host('div'),
  };
});

describe('SurahList', () => {
  it('renders surah names and ayah counts', () => {
    render(
      <SurahList
        surahs={[
          { id: 1, nameArabic: 'الفاتحة', nameTranslit: 'Al-Fatihah', nameTranslation: 'The Opener', ayahCount: 7 },
        ]}
        uiLocale="en"
        onOpenSurah={vi.fn()}
      />,
    );

    expect(screen.getByText('Al-Fatihah')).toBeTruthy();
    expect(screen.getByText('The Opener · 7 ayahs')).toBeTruthy();
  });
});
