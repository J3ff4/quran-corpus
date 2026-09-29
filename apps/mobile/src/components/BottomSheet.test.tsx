import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MAX_CONTENT_WIDTH } from '@/theme/contentWidth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './BottomSheet';

// A mutable width/height behind useWindowDimensions, so the dialog tests
// below can move the window without a second `vi.mock('react-native', ...)`
// -- only one factory per mocked module is honoured. Same pattern as
// SearchScreen.test.tsx / DictionaryScreen.test.tsx / BrowseList.test.tsx.
const win = vi.hoisted(() => ({ width: 400, height: 800 }));

// Reset at the top level, not inside one describe's beforeEach: a test late
// in the file left `win.width` at 1400 and it leaked into the unrelated
// "disappearing navigation bar" describe below, which never touches `win`
// itself.
beforeEach(() => {
  win.width = 400;
  win.height = 800;
});

/** The sheet's recorded `onEnd`, the only gesture callback this suite drives. */
function panEnd() {
  return mocks.gestures.get('onEnd') as
    | ((event: { translationY: number; velocityY: number }) => void)
    | undefined;
}

const mocks = vi.hoisted(() => ({
  backPress: null as (() => boolean) | null,
  /** Read by the settings mock, so one test can run the whole sheet under
   *  reduced motion without a second suite. */
  reduceMotion: false,
  /** What Keyboard.metrics() reports at mount: a keyboard already up before
   *  the sheet existed, which fires no didShow event of its own. */
  keyboardMetrics: undefined as undefined | { height: number },
  backRemove: vi.fn(),
  // In declaration order: translateY, fade, sheetHeight. The pan gesture is
  // otherwise unreachable from a test -- GestureDetector is stubbed out -- and
  // the drag-to-dismiss branch is the one place the two values move apart.
  sharedValues: [] as Array<{ value: unknown }>,
  /** The sheet's own Keyboard subscriptions, by event name. jsdom has no
   *  keyboard, so calling one of these IS the keyboard opening. */
  keyboardListeners: new Map<string, (event: unknown) => void>(),
  /** Every useAnimatedStyle worklet, in declaration order: backdrop, sheet. */
  styleFactories: [] as Array<() => Record<string, unknown>>,
  gestures: new Map<string, (event: never) => void>(),
  // Which animation primitive each move went through. The frames are not
  // observable from jsdom, but the choice of primitive is, and that is the
  // whole of the owner's "no spring" ruling.
  animations: [] as string[],
  /** The props the sheet handed its Modal, or null if it rendered no Modal. */
  modalProps: null as null | Record<string, unknown>,
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ reduceMotion: mocks.reduceMotion }),
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
    Keyboard: {
      metrics: () => mocks.keyboardMetrics,
      addListener: (event: string, handler: (payload: unknown) => void) => {
        mocks.keyboardListeners.set(event, handler);
        return { remove: () => mocks.keyboardListeners.delete(event) };
      },
    },
    Pressable: host('button'),
    StyleSheet: { absoluteFill: {} },
    Text: host('span'),
    View: host('div'),
    useWindowDimensions: () => ({ width: win.width, height: win.height, scale: 2, fontScale: 1 }),
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
    // Captured rather than run: letting the worklet's output reach the DOM
    // would change what every other test here renders. The keyboard test below
    // calls the sheet's own factory directly instead.
    useAnimatedStyle: (factory: () => Record<string, unknown>) => {
      mocks.styleFactories.push(factory);
      return {};
    },
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

// A device with gesture navigation: the sheet is anchored behind that bar and
// the keyboard covers it too, so the lift has to include it.
const insets = vi.hoisted(() => ({ bottom: 24 }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: insets.bottom, left: 0, right: 0 }),
}));

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
    mocks.keyboardListeners.clear();
    mocks.keyboardMetrics = undefined;
    mocks.reduceMotion = false;
    mocks.styleFactories = [];
  });

  afterEach(cleanup);

  it('restores the backdrop dim when a drag stops short of dismissing', () => {
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
    const [translateY, fade] = mocks.sharedValues;
    expect(mocks.sharedValues).toHaveLength(4);

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

  it('caps its rows at the shared content column on a wide display', () => {
    // A sheet renders inside a <Modal>, outside the navigator whose sceneStyle
    // carries `centredContent`, so it was the one surface in the app still
    // pinned to both edges: the word sheet's rows ran the full 1400dp of a
    // Tab S10+ in landscape with their chevrons at the far edge (2026-09-28).
    // Set explicitly rather than trusting the default: this test is about
    // `centredContent`'s own cap, not about the dialog/sheet split R9 adds,
    // so it stays below the expanded threshold on purpose.
    win.width = 700;
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);

    const content = screen.getByTestId('sheet-content');
    expect(content.style.maxWidth).toBe(`${MAX_CONTENT_WIDTH}px`);
    expect(content.style.alignSelf).toBe('center');
  });

  it('keeps 16 under the last row unless the sheet asks for more', () => {
    // The note sheet's floor: 24 under Save with the keyboard up was dead
    // space, trimmed 2026-09-10. Only the word sheet overrides it.
    // Plus the bottom inset in both cases -- see the next test.
    const { rerender } = render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
    expect(screen.getByTestId('sheet-surface').style.paddingBottom).toBe('40px');

    rerender(<BottomSheet onClose={() => {}} closeLabel="Close" bottomPadding={24}><span>body</span></BottomSheet>);
    expect(screen.getByTestId('sheet-surface').style.paddingBottom).toBe('48px');
  });

  it('pads past the system navigation buttons rather than hiding them', () => {
    // The sheet is anchored at bottom: 0 of an edge-to-edge window, so on a
    // device with three-button navigation the buttons land on its last row
    // (owner, on an S24, 2026-09-15). It used to answer that by hiding the
    // bar, which collapsed insets.bottom to 0 for as long as any sheet was
    // open -- and everything docked off the tab pill is positioned from that
    // inset, so the mushaf's player dropped behind the sheet and came back on
    // close (owner, 2026-09-16). Padding leaves the inset alone.
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);

    expect(screen.queryByTestId('system-nav-bar')).toBeNull();
    // 16 of its own room, clear of the 24dp inset.
    expect(screen.getByTestId('sheet-surface').style.paddingBottom).toBe('40px');
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

  it('rides the keyboard so a field inside it is never underneath one', () => {
    // The note editor put its input, its counter, Cancel AND Save under the
    // keyboard: the owner could not see what they typed and could not reach
    // the button that saved it (device, 2026-09-10). It is fixed here rather
    // than there -- the sheet owns where the sheet sits, and the next sheet
    // with a field in it would have shipped the same defect.
    render(<BottomSheet onClose={() => {}} closeLabel="Close">{null}</BottomSheet>);
    mocks.keyboardListeners.get('keyboardDidShow')?.({ endCoordinates: { height: 300 } });

    // 300 of keyboard plus the 24dp navigation bar it also covers: RN reports
    // the ime inset minus the system bars, and the sheet is anchored behind
    // them. Lift only the reported height and the last row stays buried.
    // The second worklet is the sheet's; the first is the backdrop's.
    const sheetStyle = mocks.styleFactories[1]!();
    const transform = sheetStyle.transform as Array<{ translateY: number }>;
    expect(transform[0]!.translateY).toBe(-324);
  });

  it('drops back down when the keyboard closes', () => {
    render(<BottomSheet onClose={() => {}} closeLabel="Close">{null}</BottomSheet>);
    mocks.keyboardListeners.get('keyboardDidShow')?.({ endCoordinates: { height: 300 } });
    mocks.keyboardListeners.get('keyboardDidHide')?.({});

    const transform = mocks.styleFactories[1]!().transform as Array<{ translateY: number }>;
    expect(transform[0]!.translateY).toBe(0);
  });

  it('unsubscribes from the keyboard when it closes', () => {
    const { unmount } = render(
      <BottomSheet onClose={() => {}} closeLabel="Close">{null}</BottomSheet>,
    );
    expect(mocks.keyboardListeners.size).toBe(2);
    unmount();
    // Left subscribed, every sheet ever opened keeps animating a dead value.
    expect(mocks.keyboardListeners.size).toBe(0);
  });

  it('starts lifted when the keyboard was already up before it opened', () => {
    // No didShow fires for a keyboard that was already open, so a sheet that
    // only listens sits under it for its whole life.
    mocks.keyboardMetrics = { height: 300 };
    render(<BottomSheet onClose={() => {}} closeLabel="Close">{null}</BottomSheet>);

    const transform = mocks.styleFactories[1]!().transform as Array<{ translateY: number }>;
    expect(transform[0]!.translateY).toBe(-324);
  });

  it('does not animate the lift under reduced motion', () => {
    mocks.reduceMotion = true;
    render(<BottomSheet onClose={() => {}} closeLabel="Close">{null}</BottomSheet>);
    mocks.animations = [];

    mocks.keyboardListeners.get('keyboardDidShow')?.({ endCoordinates: { height: 300 } });

    // Every other movement in this sheet is already gated on reduced motion;
    // an ungated lift slides 300+dp for a user who asked for none.
    expect(mocks.animations).toHaveLength(0);
    const transform = mocks.styleFactories[1]!().transform as Array<{ translateY: number }>;
    expect(transform[0]!.translateY).toBe(-324);
  });

  it('drags all the way off screen with the keyboard up', () => {
    // The visible offset is `translateY - keyboardLift`, so a dismiss that
    // travels only to the sheet's height leaves a keyboard's worth of sheet
    // still on screen at the moment onClose unmounts it -- a pop, not a slide.
    render(<BottomSheet onClose={() => {}} closeLabel="Close">{null}</BottomSheet>);
    const [translateY] = mocks.sharedValues;
    mocks.keyboardListeners.get('keyboardDidShow')?.({ endCoordinates: { height: 300 } });

    panEnd()?.({ translationY: 300, velocityY: 0 });

    // 800 of screen (no onLayout in jsdom, so the fallback height) + 324.
    expect(translateY!.value).toBe(1124);
  });

  it('sits where it always did when no keyboard is up', () => {
    // The other half of the branch. Without it a sheet hardcoded to -300 --
    // or one subtracting a constant -- passes the test above and floats above
    // the bottom edge of every screen in the app.
    render(<BottomSheet onClose={() => {}} closeLabel="Close">{null}</BottomSheet>);

    const sheetStyle = mocks.styleFactories[1]!();
    const transform = sheetStyle.transform as Array<{ translateY: number }>;
    expect(transform[0]!.translateY).toBe(0);
  });

  it('renders its children inside the dialog', () => {
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>the body</span></BottomSheet>);

    expect(screen.getByRole('dialog').textContent).toContain('the body');
  });

  it('becomes a centred dialog on an expanded window', () => {
    // R9. A bottom sheet on a 1400dp landscape tablet puts its controls at the
    // far bottom edge, away from both hands.
    win.width = 1400;
    win.height = 900;
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);

    const surface = screen.getByTestId('sheet-surface');
    expect(surface.style.maxWidth).toBe('520px');
    expect(surface.style.alignSelf).toBe('center');
    // Not glued to the bottom any more.
    expect(surface.style.bottom).toBe('');
  });

  it('hides the grab handle on a dialog', () => {
    // The handle advertises a drag, and the dialog has no drag.
    win.width = 1400;
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
    expect(screen.queryByTestId('sheet-handle')).toBeNull();
  });

  it('stays a bottom sheet on a phone and on a medium window', () => {
    // Compact unchanged, and medium deliberately keeps the sheet: a 700dp
    // window is not wide enough for a dialog to read as anything but a sheet
    // with margins.
    for (const width of [360, 700]) {
      win.width = width;
      render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
      expect(screen.getByTestId('sheet-surface').style.bottom).toBe('0px');
      expect(screen.getByTestId('sheet-handle')).toBeTruthy();
      cleanup();
    }
  });

  it('still dismisses a dialog on backdrop tap', () => {
    // Drag is gone at expanded; backdrop tap and the back button are what is
    // left, so neither may regress along with it.
    win.width = 1400;
    const onClose = vi.fn();
    render(<BottomSheet onClose={onClose} closeLabel="Close"><span>body</span></BottomSheet>);

    fireEvent.click(screen.getByTestId('sheet-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('centres a dialog in the space above the keyboard', () => {
    // The note sheet is a dialog at expanded, and a dialog that ignores the
    // keyboard puts its text area behind it -- the exact bug the owner hit on
    // the sheet path (2026-09-10, "text area is still behind the keyboard").
    // The container is padded rather than the card translated: translating a
    // tall card by a full keyboard's height pushes its top edge off-screen,
    // shrinking the box it centres in cannot.
    win.width = 1400;
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);

    mocks.keyboardListeners.get('keyboardDidShow')?.({ endCoordinates: { height: 300 } });

    // 300 of keyboard + the 24dp bottom inset, same sum the sheet path lifts by.
    expect(mocks.styleFactories[2]!().paddingBottom).toBe(324);
  });

  it('leaves the sheet path unpadded when the keyboard opens', () => {
    // The other half of the branch. Below expanded the surface is
    // `position: absolute, bottom: 0` and lifts itself by translateY -- an
    // ungated container padding would move the backdrop's flex box under a
    // sheet that is already clearing the keyboard on its own.
    win.width = 400;
    render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);

    mocks.keyboardListeners.get('keyboardDidShow')?.({ endCoordinates: { height: 300 } });

    expect(mocks.styleFactories[2]!().paddingBottom).toBe(0);
  });

  it('lets a dialog ask for more room under its last row', () => {
    // The word sheet passes bottomPadding={24}. A dialog hardcoded to 20 is
    // the one surface in the app where that prop silently does nothing.
    win.width = 1400;
    const { rerender } = render(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);
    // No bottom inset on a dialog -- it is not docked against a system bar.
    expect(screen.getByTestId('sheet-surface').style.paddingBottom).toBe('20px');

    rerender(<BottomSheet onClose={() => {}} closeLabel="Close" bottomPadding={24}><span>body</span></BottomSheet>);
    expect(screen.getByTestId('sheet-surface').style.paddingBottom).toBe('24px');
  });

  it('still dismisses a dialog on the Android back button', () => {
    win.width = 1400;
    const onClose = vi.fn();
    render(<BottomSheet onClose={onClose} closeLabel="Close"><span>body</span></BottomSheet>);

    const handled = mocks.backPress?.();

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(handled).toBe(true);
  });
});

describe('BottomSheet and the disappearing navigation bar', () => {
  afterEach(() => {
    cleanup();
    insets.bottom = 24;
  });

  it('keeps its height when the navigation bar hides underneath it', () => {
    // The mushaf hides the nav bar with its chrome, which collapses
    // insets.bottom to 0 -- so an open word sheet or reciter picker lost 24dp
    // of padding, got shorter, and its top edge slid down while the reader was
    // looking at it (owner, device, 2026-09-22). The inset the sheet is padded
    // past is the one that was there when it opened (ruling R3).
    const { rerender } = render(
      <BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>,
    );
    expect(screen.getByTestId('sheet-surface').style.paddingBottom).toBe('40px');

    insets.bottom = 0;
    rerender(<BottomSheet onClose={() => {}} closeLabel="Close"><span>body</span></BottomSheet>);

    expect(screen.getByTestId('sheet-surface').style.paddingBottom).toBe('40px');
  });
});
