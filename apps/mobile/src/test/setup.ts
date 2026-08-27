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
  const Svg = el('svg');
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
    useSharedValue: (initial: number) => ({ value: initial }),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    withTiming: (toValue: number) => toValue,
    withSpring: (toValue: number) => toValue,
    Easing: { bezier: () => undefined, out: (fn: unknown) => fn, ease: undefined },
  };
});
