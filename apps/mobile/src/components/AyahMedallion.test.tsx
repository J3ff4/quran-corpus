/// <reference lib="dom" />
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AyahMedallion } from './AyahMedallion';

vi.mock('react-native', async () => {
  const React = await import('react');
  const host =
    (tag: string) =>
    ({ accessibilityLabel, accessibilityRole, children, ...props }: {
      accessibilityLabel?: string;
      accessibilityRole?: string;
      children?: React.ReactNode;
    }) =>
      React.createElement(
        tag,
        { ...props, 'aria-label': accessibilityLabel, role: accessibilityRole },
        children,
      );

  return { Text: host('span'), View: host('div') };
});

vi.mock('react-native-svg', async () => {
  const React = await import('react');
  const Svg = ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement('svg', props, children);
  const Path = (props: { d: string }) => React.createElement('path', props);
  return { default: Svg, Svg, Path };
});

describe('AyahMedallion', () => {
  afterEach(cleanup);

  it('announces the ayah it marks', () => {
    render(<AyahMedallion n={255} />);

    // Queried by label, not by role: RN's accessibilityRole is "image", which
    // the mock passes straight through to a DOM role of "image" -- not the
    // ARIA "img" role, so getByRole('img') would not find it.
    //
    // Without this the rosette is decorative art with a loose digit beside it
    // and TalkBack reads "255" with no idea what it counts.
    expect(screen.getByLabelText('Ayah 255')).toBeTruthy();
  });

  it('draws the number inside the rosette', () => {
    render(<AyahMedallion n={7} />);

    expect(screen.getByText('7')).toBeTruthy();
  });

  it('draws both layers of the rosette', () => {
    const { container } = render(<AyahMedallion n={1} />);

    // A filled backing plus the stroked outline. One path means the port
    // dropped a layer and the number sits on whatever is behind the card.
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });
});
