import { vi } from 'vitest';

// react-native-svg is a native module with no jsdom implementation, so every
// test that renders an icon or the ayah rosette needs it stubbed. Declared once
// here rather than per file: it was copied into four suites, and the next
// element a component reaches for (<G>, <Circle>) would have to be added to all
// of them -- the ones that were missed failing on an undefined component
// instead of anything that names the cause.
vi.mock('react-native-svg', async () => {
  const React = await import('react');
  const el = (tag: string) =>
    ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement(tag, props, children);
  // testID -> data-testid, the same mapping rnHosts applies to every other
  // host: without it an icon's handle lands as a stray `testid` attribute and
  // getByTestId never sees it.
  const Svg = ({ children, testID, ...props }: { children?: React.ReactNode; testID?: string }) =>
    React.createElement('svg', { ...props, 'data-testid': testID }, children);
  return {
    default: Svg,
    Svg,
    Path: (props: { d: string }) => React.createElement('path', props),
    // Added for <Bloom> (M6a). Without them the gradient elements render as
    // undefined, which fails on a value rather than on anything naming the
    // cause -- the exact reason this mock lives here and not per suite.
    Defs: el('defs'),
    RadialGradient: el('radialGradient'),
    Stop: el('stop'),
    Rect: el('rect'),
  };
});

// useSafeAreaInsets throws outside a SafeAreaProvider, and no suite renders
// through one -- expo-router mounts the provider on the device. Declared here
// rather than per file for the same reason react-native-svg is: ten suites
// reach it, and the eleventh would fail on a value rather than on anything
// naming the cause.
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children?: unknown }) => children,
}));

// react-native-reanimated is a native module whose JS entry pulls in a worklets
// runtime jsdom has no counterpart for, so importing it fails collection
// outright. Declared here rather than per suite for the same reason the two
// mocks above are: every M6 component that reacts to a press reaches
// usePressScale, and the suite that forgets this fails on a module-resolution
// error that names reanimated rather than the component under test.
//
// The shared value is a plain mutable box and withTiming resolves instantly:
// nothing here asserts on a frame, and the timing branch that *is* worth
// testing (reduced motion) lives in the pure nextPressScale.
vi.mock('react-native-reanimated', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  return {
    default: {
      createAnimatedComponent: (Component: unknown) => Component,
      // Through the host shim, like Animated.Text below and for a second
      // reason as well: an Animated.View is where a component puts an
      // animated style, which arrives as `style={[layout, animatedStyle]}`,
      // and React DOM throws "'set' on proxy" trying to assign into a style
      // array. host() flattens it.
      View: host('div'),
      // Through the same host shim the plain <Text> uses, not a raw spread:
      // an Animated.Text is where a component puts a label it also animates
      // (the reader's fading surah name), and a raw spread renders testID and
      // accessibilityLabel as unknown DOM attributes that no query can reach.
      Text: host('span'),
    },
    // Layout-animation builders, for the dictionary pager and the reader's
    // note reveal. Chainable through a proxy rather than a literal
    // `{ duration }`, because the app configures them by fluent chain
    // (`SlideInRight.duration(260)`, `LinearTransition.duration(200).easing(...)`)
    // and a chain that ends at the first call returns undefined for the next
    // one. Inert because jsdom has no animation to run -- which builder each
    // case picks is asserted in motion/entryPager.test.ts and
    // motion/bookmarkReveal.test.ts against their own mocks, and the
    // components only have to render.
    ...Object.fromEntries(
      [
        'FadeIn',
        'FadeOut',
        'SlideInLeft',
        'SlideInRight',
        'SlideOutLeft',
        'SlideOutRight',
        'ZoomIn',
        'ZoomOut',
        'LinearTransition',
      ].map((name) => {
        const builder: unknown = new Proxy({ name }, { get: (target, key) => (key === 'name' ? target.name : () => builder) });
        return [name, builder];
      }),
    ),
    // Identity: a component that calls runOnJS(fn) and stores the result
    // expects something callable back, and withTiming below calls it straight
    // away.
    runOnJS: (fn: unknown) => fn,
    // A ref, not a fresh object per call. It is used as a hook, and the mock
    // returning a NEW box on every render meant every write to a shared value
    // was silently discarded at the next one -- so nothing driven by one
    // could be asserted after a re-render, which is most of what a shared
    // value is for (found 2026-09-11, when a curtain that measured itself
    // correctly still read as height 0 in the suite).
    useSharedValue: (initial: number) => {
      const box = React.useRef({ value: initial });
      return box.current;
    },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    // Resolves to its target, and runs its completion callback, finished, on a
    // microtask -- NOT in the same tick.
    //
    // Both halves matter. Dropped entirely (which is what it did until M7e), a
    // component that unmounts its children when a close LANDS never unmounted
    // them at all, so a suite asserting that a collapsed disclosure is empty
    // was reading the open one's rows. Run synchronously, the opposite defect
    // becomes invisible: unmounting at the TOP of a close collapses the
    // curtain instantly with nothing left to watch, and no assertion could
    // tell the two apart. A microtask is the smallest gap that distinguishes
    // them, and `waitFor` already spans it. Nothing here asserts on a frame;
    // what is modelled is only "later, and finished".
    withTiming: (toValue: number, _config?: unknown, callback?: (finished?: boolean) => void) => {
      if (callback) queueMicrotask(() => callback(true));
      return toValue;
    },
    withSpring: (toValue: number) => toValue,
    // Resolves to its last step, like withTiming resolves to its target: the
    // pulse's SHAPE is asserted in motion/bookmarkReveal.test.ts, which
    // records the steps instead.
    withSequence: (...steps: number[]) => steps[steps.length - 1],
    // `in`, `out` and `inOut` all present: a component importing a curve the
    // shim omits throws at MODULE level, which fails the whole file with "no
    // tests" and no line pointing at the missing key.
    Easing: {
      bezier: () => undefined,
      in: (fn: unknown) => fn,
      out: (fn: unknown) => fn,
      inOut: (fn: unknown) => fn,
      cubic: undefined,
      ease: undefined,
    },
  };
});

// expo-navigation-bar is a native module: its JS entry reaches for
// ExpoNavigationBar through expo-modules-core, which has no jsdom counterpart.
// Declared here rather than per suite for the same reason the three mocks above
// are -- every sheet in the app reaches it through BottomSheet, so the suite
// that forgot it would fail on a module-resolution error naming the navigation
// bar rather than the component under test.
//
// Rendered as a real element rather than as null, so a suite can assert WHICH
// request a screen is making. On the device the component renders null and the
// module merges the props of every mounted instance; the mock models one
// instance at a time, which is all any single suite mounts.
vi.mock('expo-navigation-bar', async () => {
  const React = await import('react');
  return {
    NavigationBar: ({ hidden }: { hidden?: boolean }) =>
      React.createElement('div', {
        'data-testid': 'system-nav-bar',
        'data-hidden': hidden ? 'true' : 'false',
      }),
  };
});

// expo-status-bar, for the same reason as expo-navigation-bar above: a native
// module with no jsdom counterpart, reached by the mushaf on every render.
// Rendered as a real element so a suite can assert WHICH request is being made
// -- on the device the component renders null and RN merges the props of every
// mounted instance by mount order.
vi.mock('expo-status-bar', async () => {
  const React = await import('react');
  return {
    StatusBar: ({ hidden, style }: { hidden?: boolean; style?: string }) =>
      React.createElement('div', {
        'data-testid': 'system-status-bar',
        'data-hidden': hidden ? 'true' : 'false',
        'data-style': style ?? 'auto',
      }),
  };
});

// expo-audio, for the same reason again: its JS entry reads __DEV__ and reaches
// ExpoAudio through expo-modules-core, so under jsdom it fails to parse before
// anything can be asserted. Declared here now that the recitation engine sits
// in a provider at the root -- every screen's suite reaches it, not only the
// two that play audio.
//
// Inert on purpose. The suites that exercise playback pass their own driver
// into useRecitation and never touch these; the rest only need the import to
// resolve.
vi.mock('expo-audio', () => ({
  createAudioPlayer: vi.fn(),
  setAudioModeAsync: vi.fn(async () => undefined),
  preload: vi.fn(async () => undefined),
  clearPreloadedSource: vi.fn(async () => undefined),
  clearAllPreloadedSources: vi.fn(async () => undefined),
}));
