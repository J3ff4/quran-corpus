import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './BottomSheet';

/** The sheet's recorded `onEnd`, the only gesture callback this suite drives. */
function panEnd() {
  return mocks.gestures.get('onEnd') as
    | ((event: { translationY: number; velocityY: number }) => void)
    | undefined;
}

const mocks = vi.hoisted(() => ({
  backPress: null as (() => boolean) | null,
  backRemove: vi.fn(),
  // In declaration order: translateY, fade, sheetHeight. The pan gesture is
  // otherwise unreachable from a test -- GestureDetector is stubbed out -- and
  // the drag-to-dismiss branch is the one place the two values move apart.
  sharedValues: [] as Array<{ value: unknown }>,
  gestures: new Map<string, (event: never) => void>(),
  // Which animation primitive each move went through. The frames are not
  // observable from jsdom, but the choice of primitive is, and that is the
  // whole of the owner's "no spring" ruling.
  animations: [] as string[],
  /** The props the sheet handed its Modal, or null if it rendered no Modal. */
  modalProps: null as null | Record<string, unknown>,
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ reduceMotion: false }),
}));

vi.mock('react-native', async () => {
  const React = await import('react');
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
    // Recorded rather than taken from the shim: the shim renders a Modal's
    // children inline, so every assertion below passes just as well with no
    // Modal at all. This is what makes "it is in a Modal" testable.
    Modal: ({ children, ...props }: { children?: React.ReactNode }) => {
      mocks.modalProps = props as Record<string, unknown>;
      return React.createElement(React.Fragment, null, children);
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

vi.mock('react-native-gesture-handler', async () => {
  const { reactNativeGestureHandlerMock } = await import('@/testing/rnHosts.js');
  const gestureHandler = reactNativeGestureHandlerMock();
  mocks.gestures = gestureHandler.__gestureHandlers;
  return gestureHandler;
});

describe('BottomSheet', () => {
  beforeEach(() => {
    mocks.backPress = null;
    mocks.backRemove.mockClear();
    mocks.sharedValues = [];
    mocks.gestures.clear();
    mocks.animations = [];
    mocks.modalProps = null;
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
    panEnd()?.({ translationY: 300, velocityY: 0 });
    expect(fade!.value).toBe(0);

    // Under a quarter of the 800px height and slow: the sheet slides back.
    panEnd()?.({ translationY: 40, velocityY: 0 });

    expect(translateY!.value).toBe(0);
    expect(fade!.value).toBe(1);
  });

  it('drops the backdrop dim when the drag does dismiss', () => {
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
    const [, fade] = mocks.sharedValues;

    panEnd()?.({ translationY: 300, velocityY: 0 });

    expect(fade!.value).toBe(0);
  });

  it('moves on a timing curve, never a spring', () => {
    // Owner ruling 2026-08-17: "i dont like that spring. just regular movement
    // is fine." Entrance and both drag outcomes go through withTiming.
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
    expect(mocks.animations).not.toHaveLength(0);

    panEnd()?.({ translationY: 300, velocityY: 0 });
    panEnd()?.({ translationY: 40, velocityY: 0 });

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

  it('renders inside a transparent Modal so it can cover the tab pill', () => {
    // The tab pill is the navigator's own `tabBar`, a sibling of the entire
    // screen, so anything a screen renders paints under it however it is
    // positioned. On the device the word sheet's last row came out behind the
    // pill and the pill stayed tappable over the backdrop. A Modal is its own
    // native window, above the navigator.
    render(
      <BottomSheet onClose={vi.fn()} closeLabel="Close">
        <span>child</span>
      </BottomSheet>,
    );

    expect(mocks.modalProps).not.toBeNull();
    expect(mocks.modalProps?.transparent).toBe(true);
    expect(mocks.modalProps?.visible).toBe(true);
    // Otherwise the backdrop stops at the status bar.
    expect(mocks.modalProps?.statusBarTranslucent).toBe(true);
    // The sheet runs its own entrance; a Modal animation would play on top.
    expect(mocks.modalProps?.animationType).toBe('none');
  });

  it('closes on back while the Modal window has focus', () => {
    // Android routes back to the topmost Modal, so the BackHandler
    // subscription no longer sees it -- without onRequestClose, back inside
    // the sheet does nothing at all.
    const onClose = vi.fn();
    render(
      <BottomSheet onClose={onClose} closeLabel="Close">
        <span>child</span>
      </BottomSheet>,
    );

    (mocks.modalProps?.onRequestClose as () => void)();

    expect(onClose).toHaveBeenCalledTimes(1);
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
