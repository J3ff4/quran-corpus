import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setAutoLayout } from '@/testing/rnHosts';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }),
}));

import { RiseIn } from './RiseIn';

describe('RiseIn', () => {
  afterEach(() => {
    setAutoLayout(null);
    cleanup();
  });

  it('keeps its children out of the tree while shut', () => {
    const result = render(
      <RiseIn open={false}>
        <div data-testid="child" />
      </RiseIn>,
    );

    expect(result.queryByTestId('child')).toBeNull();
  });

  it('stays invisible until it has been measured', () => {
    // The rise distance is the content's own height, so before the first
    // measurement there is no distance to rise from -- and a card faded in at
    // that point is a card that appears already in place. The suite's timing
    // shim resolves every animation to its target instantly, so the travel
    // itself is device-only (the same limit Collapsible's measurement test
    // works around); what is assertable is that nothing is shown without one.
    const result = render(
      <RiseIn open testID="rise">
        <div data-testid="child" />
      </RiseIn>,
    );
    // Re-rendered for the same reason the test below is: the entrance effect
    // writes shared values, which commit no render of their own, so reading
    // the style straight after mount reads the frame before the effect ran --
    // which is 0 whether or not the guard exists.
    result.rerender(
      <RiseIn open testID="rise">
        <div data-testid="child" />
      </RiseIn>,
    );

    expect(result.getByTestId('rise').style.opacity).toBe('0');
  });

  it('shows the content once its height is known', () => {
    setAutoLayout({ width: 320, height: 96 });
    const result = render(
      <RiseIn open testID="rise">
        <div data-testid="child" />
      </RiseIn>,
    );

    // The measurement lands in a layout effect and writes shared values, which
    // commit no render of their own.
    result.rerender(
      <RiseIn open testID="rise">
        <div data-testid="child" />
      </RiseIn>,
    );

    expect(result.getByTestId('rise').style.opacity).toBe('1');
  });

  it('unmounts its children once the exit lands, and not before', async () => {
    const result = render(
      <RiseIn open>
        <div data-testid="child" />
      </RiseIn>,
    );
    expect(result.getByTestId('child')).not.toBeNull();

    result.rerender(
      <RiseIn open={false}>
        <div data-testid="child" />
      </RiseIn>,
    );

    // Still there while it is leaving. Unmounting on frame one is the blink
    // the animation exists to replace.
    expect(result.getByTestId('child')).not.toBeNull();

    await waitFor(() => expect(result.queryByTestId('child')).toBeNull());
  });

});
