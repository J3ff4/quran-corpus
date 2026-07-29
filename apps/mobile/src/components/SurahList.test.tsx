import { create, act } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SurahList } from './SurahList';

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

function requireRenderer(renderer: ReactTestRenderer | null): ReactTestRenderer {
  if (!renderer) throw new Error('SurahList test renderer was not created');
  return renderer;
}

vi.mock('react-native', async () => {
  const React = await import('react');
  const host =
    (name: string) =>
    ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(name, props, children);

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
        'FlatList',
        null,
        data.map((item, index) =>
          React.createElement('FlatListItem', { key: keyExtractor?.(item, index) ?? index }, renderItem({ item, index })),
        ),
      ),
    Pressable: host('Pressable'),
    Text: host('Text'),
    View: host('View'),
    StyleSheet: {
      create: <T extends object>(styles: T) => styles,
      flatten: (style: unknown) => style,
    },
  };
});

describe('SurahList', () => {
  it('renders surah names and ayah counts', () => {
    let renderer: ReactTestRenderer | null = null;
    act(() => {
      renderer = create(
        <SurahList
          surahs={[
            { id: 1, nameArabic: 'الفاتحة', nameTranslit: 'Al-Fatihah', nameTranslation: 'The Opener', ayahCount: 7 },
          ]}
          onOpenSurah={vi.fn()}
        />,
      );
    });

    const output = JSON.stringify(requireRenderer(renderer).toJSON());

    expect(output).toContain('Al-Fatihah');
    expect(output).toContain('7 ayahs');
  });
});
