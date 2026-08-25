import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Without this Vite parses React Native's own Flow-typed source and the suite
// fails to collect at all ("Expected 'from', got 'typeOf'"), which reads as a
// broken test file rather than as a missing mock.
vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

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
  afterEach(cleanup);

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
});
