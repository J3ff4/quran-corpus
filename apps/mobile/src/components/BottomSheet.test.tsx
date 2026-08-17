import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './BottomSheet';

const mocks = vi.hoisted(() => ({
  backPress: null as (() => boolean) | null,
  backRemove: vi.fn(),
  // In declaration order: translateY, fade, sheetHeight. The pan gesture is
  // otherwise unreachable from a test -- GestureDetector is stubbed out -- and
  // the drag-to-dismiss branch is the one place the two values move apart.
  sharedValues: [] as Array<{ value: unknown }>,
  panEnd: null as ((event: { translationY: number; velocityY: number }) => void) | null,
  // Which animation primitive each move went through. The frames are not
  // observable from jsdom, but the choice of primitive is, and that is the
  // whole of the owner's "no spring" ruling.
  animations: [] as string[],
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ reduceMotion: false }),
}));

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return {
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove: () => {} }),
    },
    BackHandler: {
      addEventListener: (_event: string, handler: () => boolean) => {
        mocks.backPress = handler;
        return { remove: mocks.backRemove };
      },
    },
    Pressable: host('button'),
    StyleSheet: { absoluteFill: {} },
    Text: host('span'),
    View: host('div'),
    useWindowDimensions: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
  };
});

vi.mock('react-native-reanimated', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return {
    default: {
      View: host('div'),
      createAnimatedComponent: (Component: unknown) => Component,
    },
    runOnJS: (fn: unknown) => fn,
    useAnimatedStyle: () => ({}),
    useSharedValue: (initial: unknown) => {
      const shared = { value: initial };
      mocks.sharedValues.push(shared);
      return shared;
    },
    withSpring: (to: unknown) => {
      mocks.animations.push('spring');
      return to;
    },
    withTiming: (to: unknown) => {
      mocks.animations.push('timing');
      return to;
    },
    Easing: {
      cubic: (t: number) => t,
      in: (fn: unknown) => fn,
      out: (fn: unknown) => fn,
    },
  };
});

vi.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children?: React.ReactNode }) => children,
  Gesture: {
    Pan: () => {
      const chain = {
        enabled: () => chain,
        onUpdate: () => chain,
        onEnd: (handler: (event: { translationY: number; velocityY: number }) => void) => {
          mocks.panEnd = handler;
          return chain;
        },
      };
      return chain;
    },
  },
}));

describe('BottomSheet', () => {
  beforeEach(() => {
    mocks.backPress = null;
    mocks.backRemove.mockClear();
    mocks.sharedValues = [];
    mocks.panEnd = null;
    mocks.animations = [];
  });

  afterEach(cleanup);

  it('restores the backdrop dim when a drag stops short of dismissing', () => {
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
    const [translateY, fade] = mocks.sharedValues;
    expect(mocks.sharedValues).toHaveLength(3);

    // The real sequence: a dismissing drag starts the fade out, its animation
    // is interrupted by a second drag, and that one stops short. Starting from
    // a freshly opened sheet instead would assert nothing -- the entrance
    // effect already left `fade` at 1.
    mocks.panEnd?.({ translationY: 300, velocityY: 0 });
    expect(fade!.value).toBe(0);

    // Under a quarter of the 800px height and slow: the sheet slides back.
    mocks.panEnd?.({ translationY: 40, velocityY: 0 });

    expect(translateY!.value).toBe(0);
    expect(fade!.value).toBe(1);
  });

  it('drops the backdrop dim when the drag does dismiss', () => {
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
    const [, fade] = mocks.sharedValues;

    mocks.panEnd?.({ translationY: 300, velocityY: 0 });

    expect(fade!.value).toBe(0);
  });

  it('moves on a timing curve, never a spring', () => {
    // Owner ruling 2026-08-17: "i dont like that spring. just regular movement
    // is fine." Entrance and both drag outcomes go through withTiming.
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
    expect(mocks.animations).not.toHaveLength(0);

    mocks.panEnd?.({ translationY: 300, velocityY: 0 });
    mocks.panEnd?.({ translationY: 40, velocityY: 0 });

    expect(mocks.animations).not.toContain('spring');
  });

  it('closes on backdrop press', () => {
    const onClose = vi.fn();
    render(<BottomSheet onClose={onClose} closeLabel="Close"><span>body</span></BottomSheet>);

    fireEvent.click(screen.getByTestId('sheet-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('names the backdrop so TalkBack does not read an unlabelled button', () => {
    render(<BottomSheet onClose={() => {}} closeLabel="Dismiss languages"><span>body</span></BottomSheet>);

    expect(screen.getByTestId('sheet-backdrop').getAttribute('aria-label')).toBe('Dismiss languages');
  });

  it('closes on the Android back button instead of leaving the screen underneath', () => {
    const onClose = vi.fn();
    render(<BottomSheet onClose={onClose} closeLabel="Close"><span>body</span></BottomSheet>);

    const handled = mocks.backPress?.();

    expect(onClose).toHaveBeenCalledTimes(1);
    // Returning false lets the press fall through to the navigator as well, so
    // one back tap would dismiss the sheet AND leave the screen under it.
    expect(handled).toBe(true);
  });

  it('stops intercepting back once it unmounts', () => {
    const { unmount } = render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);

    unmount();

    // Left subscribed, a gone sheet swallows every back press in the app.
    expect(mocks.backRemove).toHaveBeenCalled();
  });

  it('renders its children inside the dialog', () => {
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>the body</span></BottomSheet>);

    expect(screen.getByRole('dialog').textContent).toContain('the body');
  });
});
