import { vi } from 'vitest';

// react-native-svg is a native module with no jsdom implementation, so every
// test that renders an icon or the ayah rosette needs it stubbed. Declared once
// here rather than per file: it was copied into four suites, and the next
// element a component reaches for (<G>, <Circle>) would have to be added to all
// of them -- the ones that were missed failing on an undefined component
// instead of anything that names the cause.
vi.mock('react-native-svg', async () => {
  const React = await import('react');
  const Svg = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('svg', props, children);
  const Path = (props: { d: string }) => React.createElement('path', props);
  return { default: Svg, Svg, Path };
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
