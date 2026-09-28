import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const win = vi.hoisted(() => ({ width: 390, height: 844 }));

// Without this Vite parses React Native's own Flow-typed source and the suite
// fails to collect at all ("Expected 'from', got 'typeOf'"), which reads as a
// broken test file rather than as a missing mock. The window size is mocked
// alongside it because the wash's geometry is now derived from it.
vi.mock('react-native', async () => ({
  ...(await import('@/testing/rnHosts.js')).reactNativeTextMock(),
  useWindowDimensions: () => ({ ...win, scale: 3, fontScale: 1 }),
}));

import { Bloom } from './Bloom';
import { ThemeContext, type ThemeColors } from '@/theme/themeContext';
import { bloom, themeColors } from '@/theme/tokens';

/** React DOM emits the SVG `stopColor` prop as the `stop-color` attribute, and
 *  react-native-svg's own Stop takes it as `stopColor`. Read both so the
 *  assertion is about the colour, not about which spelling survived. */
function stopsOf(container: Element): { color: string | null; opacity: string | null }[] {
  // Array.from, not a spread: the app tsconfig targets a level where
  // NodeListOf has no [Symbol.iterator] declared, so a spread is a type error
  // even though it runs.
  return Array.from(container.querySelectorAll('stop')).map((stop) => ({
    color: stop.getAttribute('stop-color') ?? stop.getAttribute('stopColor'),
    opacity: stop.getAttribute('stop-opacity') ?? stop.getAttribute('stopOpacity'),
  }));
}

/** What the token must arrive as: a colour with no alpha in it, and the alpha
 *  carried alongside. Asserting the raw `rgba()` token instead is what let a
 *  wash of undiluted accent ship -- react-native-svg drops alpha inside
 *  `stopColor`, so that assertion passes whether or not the stop is
 *  transparent on device. */
function expectedStops(stops: readonly string[]) {
  return stops.map((stop) => {
    const [r, g, b, a] = /rgba\(([\d.]+),([\d.]+),([\d.]+),([\d.]+)\)/.exec(stop)!.slice(1);
    return { color: `rgb(${r}, ${g}, ${b})`, opacity: String(Number(a)) };
  });
}

function renderIn(theme: ThemeColors) {
  return render(
    <ThemeContext.Provider value={theme}>
      <Bloom />
    </ThemeContext.Provider>,
  );
}

describe('Bloom', () => {
  afterEach(() => {
    win.width = 390;
    win.height = 844;
    cleanup();
  });

  it('draws the dark bloom stops when the dark theme is active', () => {
    const { container } = renderIn(themeColors.dark);

    expect(stopsOf(container)).toEqual(expectedStops(bloom.dark.stops));
  });

  it('draws the light bloom stops when the light theme is active', () => {
    // Not a duplicate of the test above: the component picks its stops off the
    // theme, and a hardcoded `bloom.dark` renders the night wash over warm
    // paper -- which looks deliberate enough that a screenshot would not catch it.
    const { container } = renderIn(themeColors.light);

    expect(stopsOf(container)).toEqual(expectedStops(bloom.light.stops));
  });

  it('keeps the wash the same shape whatever the viewport aspect ratio', () => {
    // The radii used to be percentages of each axis, which let the aspect
    // ratio reshape the ellipse: tuned tall on a phone, the same numbers drew
    // a squat left-hugging band on a wide screen that died at 60% of the
    // height with bare ground below it. Measured on a Tab S10+ in landscape,
    // 2026-09-27: wash gone by 56% of the width and 53% of the height -- the
    // "gradient only on the left, right side black" a Z Fold owner reported.
    //
    // Sizing both radii off the diagonal fixes the shape in absolute terms, so
    // the ratio between them is a constant of the design, not of the screen.
    function shapeAt(width: number, height: number) {
      win.width = width;
      win.height = height;
      const { container } = renderIn(themeColors.dark);
      const gradient = container.querySelector('radialGradient')!;
      const rx = Number(gradient.getAttribute('rx'));
      const ry = Number(gradient.getAttribute('ry'));
      cleanup();
      return ry / rx;
    }

    const phone = shapeAt(390, 844);
    const tabletLandscape = shapeAt(1400, 876);

    expect(tabletLandscape).toBeCloseTo(phone, 6);
  });

  it('covers a wide viewport rather than dying partway down it', () => {
    // The symptom the owner actually reported, asserted as geometry: the wash
    // must still be spreading at the bottom edge of a landscape tablet.
    win.width = 1400;
    win.height = 876;
    const { container } = renderIn(themeColors.dark);

    const gradient = container.querySelector('radialGradient')!;
    const cy = Number(gradient.getAttribute('cy'));
    const ry = Number(gradient.getAttribute('ry'));

    expect(cy + ry).toBeGreaterThan(876);
  });
});
