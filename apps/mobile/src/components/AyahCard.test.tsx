import { create, act } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AyahCard } from './AyahCard';

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

vi.mock('react-native', async () => {
  const React = await import('react');
  const host =
    (name: string) =>
    ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(name, props, children);

  return {
    Pressable: host('Pressable'),
    Text: host('Text'),
    View: host('View'),
  };
});

function requireRenderer(renderer: ReactTestRenderer | null): ReactTestRenderer {
  if (!renderer) throw new Error('AyahCard test renderer was not created');
  return renderer;
}

describe('AyahCard', () => {
  it('calls bookmark and audio handlers without exposing ayah text to callbacks', () => {
    const onToggleBookmark = vi.fn();
    const onToggleAudio = vi.fn();
    let renderer: ReactTestRenderer | null = null;

    act(() => {
      renderer = create(
        <AyahCard
          ayahNumber={1}
          arabicText="Arabic text"
          translationText="Translation text"
          bookmarked={false}
          playing={false}
          onToggleBookmark={onToggleBookmark}
          onToggleAudio={onToggleAudio}
        />,
      );
    });

    const root = requireRenderer(renderer).root;
    const buttons = root.findAll((node) => String(node.type) === 'Pressable');

    act(() => {
      buttons[0]?.props.onPress();
      buttons[1]?.props.onPress();
    });

    expect(onToggleBookmark).toHaveBeenCalledWith(1);
    expect(onToggleAudio).toHaveBeenCalledWith(1);
  });
});
