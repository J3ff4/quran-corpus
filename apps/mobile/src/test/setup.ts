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
