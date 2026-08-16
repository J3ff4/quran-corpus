import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MEDALLION_BACKING_PATH,
  MEDALLION_OUTLINE_PATH,
} from '@quran-corpus/config/ornaments/medallion';
import { AyahMedallion } from './AyahMedallion';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

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

  return {
    Text: host('span'),
    View: host('div'),
    useWindowDimensions: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
  };
});

describe('AyahMedallion', () => {
  afterEach(cleanup);

  it('announces the ayah it marks', () => {
    render(<AyahMedallion n={255} uiLocale="en" />);

    // Queried by label, not by role: RN's accessibilityRole is "image", which
    // the mock passes straight through to a DOM role of "image" -- not the
    // ARIA "img" role, so getByRole('img') would not find it.
    //
    // Without this the rosette is decorative art with a loose digit beside it
    // and TalkBack reads "255" with no idea what it counts.
    expect(screen.getByLabelText('Ayah 255')).toBeTruthy();
  });

  it('announces it in the reader locale, not always English', () => {
    render(<AyahMedallion n={255} uiLocale="ru" />);

    // The label replaced a bare digit, which TalkBack read in the user's own
    // language. A hardcoded English label would make every verse in the surah
    // announce "Ayah" to a Russian reader -- worse than the digit it replaced.
    expect(screen.getByLabelText('Аят 255')).toBeTruthy();
  });

  it('draws the number inside the rosette', () => {
    render(<AyahMedallion n={7} uiLocale="en" />);

    expect(screen.getByText('7')).toBeTruthy();
  });

  it('draws both layers of the rosette', () => {
    const { container } = render(<AyahMedallion n={1} uiLocale="en" />);

    // A filled backing plus the stroked outline. One path means the port
    // dropped a layer and the number sits on whatever is behind the card.
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });

  it('gives each layer its own geometry', () => {
    const { container } = render(<AyahMedallion n={1} uiLocale="en" />);

    const [backing, outline] = Array.from(container.querySelectorAll('path')).map((path) =>
      path.getAttribute('d'),
    );
    // The two paths come from separate exports of the shared ornament module.
    // Wiring both layers to one constant still renders two paths and still
    // passes the count above -- it just draws the outline twice, with the
    // backing plate missing.
    expect(backing).toBe(MEDALLION_BACKING_PATH);
    expect(outline).toBe(MEDALLION_OUTLINE_PATH);
    expect(backing).not.toBe(outline);
  });

  it('takes its colours from the theme, not a hardcoded hex', () => {
    const { container } = render(
      <ThemeContext.Provider value={themeColors.dark}>
        <AyahMedallion n={1} uiLocale="en" />
      </ThemeContext.Provider>,
    );

    const paths = container.querySelectorAll('path');
    // Backing layer first, outline second -- matches render order in
    // AyahMedallion.tsx. A hardcoded hex here would render fine in light mode
    // and produce a cream blob on a near-black background in dark mode.
    expect(paths[0]?.getAttribute('fill')).toBe(themeColors.dark.surface);
    expect(paths[1]?.getAttribute('stroke')).toBe(themeColors.dark.mutedText);
  });
});
