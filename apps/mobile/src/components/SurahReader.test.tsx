import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SurahReader } from './SurahReader';

const mocks = vi.hoisted(() => ({
  onViewableItemsChanged: null as ((info: { viewableItems: Array<{ item: unknown }> }) => void) | null,
  onScrollToIndexFailed: null as
    | ((info: { index: number; averageItemLength: number }) => void)
    | null,
  scrollToIndex: vi.fn(),
  scrollToOffset: vi.fn(),
}));

vi.mock('react-native', async () => {
  const React = await import('react');
  return {
    // Forwards the ref, so the imperative scroll calls the component makes on
    // mount are observable. A plain function component silently swallows it
    // and every scroll assertion would pass against a null ref.
    FlatList: ({ data, ListHeaderComponent, renderItem, onViewableItemsChanged, onScrollToIndexFailed, ref }: {
      data: unknown[];
      ListHeaderComponent?: React.ReactNode;
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      onViewableItemsChanged?: (info: { viewableItems: Array<{ item: unknown }> }) => void;
      onScrollToIndexFailed?: (info: { index: number; averageItemLength: number }) => void;
      ref?: React.Ref<unknown>;
    }) => {
      mocks.onViewableItemsChanged = onViewableItemsChanged ?? null;
      mocks.onScrollToIndexFailed = onScrollToIndexFailed ?? null;
      React.useImperativeHandle(ref, () => ({
        scrollToIndex: mocks.scrollToIndex,
        scrollToOffset: mocks.scrollToOffset,
      }));
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
  beforeEach(() => {
    mocks.scrollToIndex.mockClear();
    mocks.scrollToOffset.mockClear();
  });

  afterEach(cleanup);

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

  it('opens at the saved ayah and stays put when it is the first one', () => {
    render(<SurahReader {...baseProps(readerData(10))} initialAyahNumber={4} />);

    expect(mocks.scrollToIndex).toHaveBeenCalledWith({ index: 3, animated: false });

    cleanup();
    mocks.scrollToIndex.mockClear();

    // Index 0 and an ayah that is not in this surah both mean "no scroll" --
    // scrolling to the top of a list already at the top only flickers.
    render(<SurahReader {...baseProps(readerData(10))} initialAyahNumber={1} />);
    render(<SurahReader {...baseProps(readerData(10))} initialAyahNumber={999} />);

    expect(mocks.scrollToIndex).not.toHaveBeenCalled();
  });

  it('recovers from an unmeasured row by estimating the offset, then gives up', async () => {
    vi.useFakeTimers();
    try {
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);
      mocks.scrollToIndex.mockClear();

      // FlatList reports this for any row it has not laid out yet, which is
      // every row past initialNumToRender on a list of variable-height cards.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        act(() => {
          mocks.onScrollToIndexFailed?.({ index: 254, averageItemLength: 120 });
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(200);
        });
      }

      expect(mocks.scrollToOffset).toHaveBeenCalledWith({ offset: 254 * 120, animated: false });
      // Capped: a row that never measures must settle instead of retrying for
      // as long as the screen is open.
      expect(mocks.scrollToIndex).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });
});

function baseProps(data: ReturnType<typeof readerData>) {
  return {
    data,
    bookmarkedAyahs: new Set<number>(),
    playingAyah: null,
    audioEnabled: false,
    uiLocale: 'en' as const,
    onToggleBookmark: vi.fn(),
    onToggleAudio: vi.fn(),
  };
}

function readerData(ayahCount = 1) {
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
    ayahs: Array.from({ length: ayahCount }, (_unused, index) => ({
      ayah: {
        id: index + 1,
        surah_id: 1,
        ayah_number: index + 1,
        text_uthmani: 'بسم الله',
        text_simple: 'بسم الله',
        juz: 1,
        page: 1,
        audio_url: null,
      },
      translation: {
        id: index + 1,
        ayah_id: index + 1,
        language_code: 'en',
        language: 'en',
        translator: 'Saheeh International',
        text: 'In the name of Allah',
      },
    })),
  };
}
