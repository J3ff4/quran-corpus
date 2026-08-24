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
function stopColorsOf(container: Element): (string | null)[] {
  // Array.from, not a spread: the app tsconfig targets a level where
  // NodeListOf has no [Symbol.iterator] declared, so a spread is a type error
  // even though it runs.
  return Array.from(container.querySelectorAll('stop')).map(
    (stop) => stop.getAttribute('stop-color') ?? stop.getAttribute('stopColor'),
  );
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

    expect(stopColorsOf(container)).toEqual([...bloom.dark.stops]);
  });

  it('draws the light bloom stops when the light theme is active', () => {
    // Not a duplicate of the test above: the component picks its stops off the
    // theme, and a hardcoded `bloom.dark` renders the night wash over warm
    // paper -- which looks deliberate enough that a screenshot would not catch it.
    const { container } = renderIn(themeColors.light);

    expect(stopColorsOf(container)).toEqual([...bloom.light.stops]);
  });
});
