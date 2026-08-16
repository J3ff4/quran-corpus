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
