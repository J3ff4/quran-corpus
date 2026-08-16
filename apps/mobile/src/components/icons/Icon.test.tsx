import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Icon } from './Icon';

vi.mock('react-native-svg', async () => {
  const React = await import('react');
  const Svg = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('svg', props, children);
  const Path = (props: { d: string }) => React.createElement('path', props);
  return { default: Svg, Svg, Path };
});

describe('Icon', () => {
  afterEach(cleanup);

  it('draws every path of the named glyph', () => {
    const { container } = render(<Icon name="home" color="#000000" />);

    // Home is two paths on web -- roofline and walls. One means the port
    // dropped a subpath and the glyph renders as an open shape.
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });

  it('strokes with the colour it is given, not a baked-in hex', () => {
    const { container } = render(<Icon name="bookmark" color="#5aa58d" />);

    // The dark theme passes a different accent; a hardcoded stroke would make
    // every icon invisible in one of the two themes.
    expect(container.querySelector('svg')?.getAttribute('stroke')).toBe('#5aa58d');
  });

  it('has a glyph for every tab', () => {
    for (const name of ['home', 'book', 'bookmark', 'settings', 'menu'] as const) {
      const { container } = render(<Icon name={name} color="#000000" />);
      expect(container.querySelectorAll('path').length).toBeGreaterThan(0);
      cleanup();
    }
  });
});
