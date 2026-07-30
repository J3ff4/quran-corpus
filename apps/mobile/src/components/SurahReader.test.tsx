import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SurahReader } from './SurahReader';

const mocks = vi.hoisted(() => ({
  onViewableItemsChanged: null as ((info: { viewableItems: Array<{ item: unknown }> }) => void) | null,
}));

vi.mock('react-native', async () => {
  const React = await import('react');
  return {
    FlatList: ({ data, ListHeaderComponent, renderItem, onViewableItemsChanged }: {
      data: unknown[];
      ListHeaderComponent?: React.ReactNode;
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      onViewableItemsChanged?: (info: { viewableItems: Array<{ item: unknown }> }) => void;
    }) => {
      mocks.onViewableItemsChanged = onViewableItemsChanged ?? null;
      return React.createElement(
        'div',
        null,
        ListHeaderComponent,
        data.map((item, index) => React.createElement('div', { key: index }, renderItem({ item, index }))),
      );
    },
    Pressable: ({ children, onPress }: { children?: React.ReactNode; onPress?: () => void }) =>
      React.createElement('button', { onClick: onPress }, children),
    Text: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children),
    View: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
  };
});

describe('SurahReader', () => {
  it('uses the latest reading callback after rerender', () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const props = {
      data: readerData(),
      bookmarkedAyahs: new Set<number>(),
      playingAyah: null,
      audioEnabled: false,
      uiLocale: 'en' as const,
      onToggleBookmark: vi.fn(),
      onToggleAudio: vi.fn(),
    };

    const { rerender } = render(<SurahReader {...props} onReadingAyah={firstHandler} />);
    rerender(<SurahReader {...props} onReadingAyah={secondHandler} />);

    mocks.onViewableItemsChanged?.({ viewableItems: [{ item: props.data.ayahs[0] }] });

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledWith(1);
  });
});

function readerData() {
  return {
    surah: {
      id: 1,
      name_arabic: 'الفاتحة',
      name_translit: 'Al-Fatihah',
      name_translation: 'The Opener',
      revelation_type: 'meccan' as const,
      ayah_count: 7,
      order_number: 5,
    },
    ayahs: [
      {
        ayah: {
          id: 1,
          surah_id: 1,
          ayah_number: 1,
          text_uthmani: 'بسم الله',
          text_simple: 'بسم الله',
          juz: 1,
          page: 1,
          audio_url: null,
        },
        words: [],
        translation: {
          id: 1,
          ayah_id: 1,
          language_code: 'en',
          language: 'en',
          translator: 'Saheeh International',
          text: 'In the name of Allah',
        },
      },
    ],
  };
}
