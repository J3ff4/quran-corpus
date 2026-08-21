import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as RN from 'react-native';
import { ClampedText } from './ClampedText';

vi.mock('@/theme/themeContext', () => ({
  useThemeColors: () => ({ text: '#000', mutedText: '#666', accent: '#1f6f5b' }),
}));
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));
vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  // Text is built on host('span'), not a standalone mock: that is what routes
  // it through rnHosts' testID/accessibilityState mapping (including the
  // aria-expanded fix this task adds), same as every other suite's
  // Text/View/Pressable.
  //
  // jsdom's MouseEvent constructor silently drops init keys it doesn't
  // recognise, so a `fireEvent.click(node, { nativeEvent: {...} })` never
  // makes it to `event.nativeEvent` the way it would on a real synthetic
  // click -- there is no DOM channel for RN's onTextLayout payload. This
  // registry is the substitute: `layout()` below looks a component's current
  // onTextLayout up by the same testID it rendered with and calls it
  // directly, still inside `act()` so the resulting setState flushes.
  const layoutHandlers = new Map<
    string,
    (event: { nativeEvent: { lines: { text: string }[] } }) => void
  >();
  const HostText = host('span');
  const Text = ({
    onTextLayout,
    ...rest
  }: Record<string, unknown> & {
    onTextLayout?: (event: { nativeEvent: { lines: { text: string }[] } }) => void;
    testID?: string;
  }) => {
    const testID = rest.testID as string | undefined;
    if (testID && onTextLayout) layoutHandlers.set(testID, onTextLayout);
    return React.createElement(HostText, rest);
  };
  return { Text, View: host('div'), Pressable: host('button'), __layoutHandlers: layoutHandlers };
});

/** Fire onTextLayout with the lines Android would report for a clamp that DID
 *  truncate: six rendered lines whose joined text is shorter than the source. */
function layout(node: HTMLElement, shown: string[]) {
  const handlers = (
    RN as unknown as {
      __layoutHandlers: Map<string, (event: { nativeEvent: { lines: { text: string }[] } }) => void>;
    }
  ).__layoutHandlers;
  handlers.get(node.dataset.testid ?? '')?.({
    nativeEvent: { lines: shown.map((text) => ({ text })) },
  });
}

const LONG = 'a'.repeat(400);

describe('ClampedText', () => {
  afterEach(cleanup);

  it('shows no toggle before anything has been measured', () => {
    render(<ClampedText uiLocale="en">{LONG}</ClampedText>);
    expect(screen.queryByTestId('clamp-toggle')).toBeNull();
  });

  it('shows no toggle when the whole text fitted', () => {
    render(<ClampedText uiLocale="en">short</ClampedText>);
    act(() => layout(screen.getByTestId('clamp-body'), ['short']));
    expect(screen.queryByTestId('clamp-toggle')).toBeNull();
  });

  it('offers Show more once the clamp actually cut the text', () => {
    // Android reports only the RENDERED lines when numberOfLines is set, so
    // lines.length is 6 whether or not anything was cut. The joined text is
    // what distinguishes them.
    render(<ClampedText uiLocale="en">{LONG}</ClampedText>);
    act(() => layout(screen.getByTestId('clamp-body'), ['a'.repeat(50), 'a'.repeat(50)]));
    // .textContent, not the jest-dom toHaveTextContent matcher: jest-dom is an
    // apps/web dependency only (see EntryHeader.test.tsx).
    expect(screen.getByTestId('clamp-toggle').textContent).toBe('Show more');
  });

  it('expands and collapses, and says which it will do', () => {
    render(<ClampedText uiLocale="en">{LONG}</ClampedText>);
    act(() => layout(screen.getByTestId('clamp-body'), ['a'.repeat(50)]));
    const toggle = screen.getByTestId('clamp-toggle');
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe('Show less');
    expect(screen.getByTestId('clamp-body').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(toggle.textContent).toBe('Show more');
  });

  it('keeps the toggle after expanding', () => {
    // The expanded render fires onTextLayout again, this time with every line.
    // A naive re-measure would read "it all fits now" and delete the Show less
    // button out from under the reader.
    render(<ClampedText uiLocale="en">{LONG}</ClampedText>);
    act(() => layout(screen.getByTestId('clamp-body'), ['a'.repeat(50)]));
    fireEvent.click(screen.getByTestId('clamp-toggle'));
    act(() => layout(screen.getByTestId('clamp-body'), [LONG]));
    expect(screen.getByTestId('clamp-toggle').textContent).toBe('Show less');
  });

  it('renders a footer beside the toggle', () => {
    render(
      <ClampedText uiLocale="en" footer={<span>Lane</span>}>short</ClampedText>,
    );
    act(() => layout(screen.getByTestId('clamp-body'), ['short']));
    expect(screen.getByTestId('clamp-footer').textContent).toBe('Lane');
  });
});
