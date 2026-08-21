import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as RN from 'react-native';
import { ClampedText } from './ClampedText';

vi.mock('@/theme/themeContext', () => ({
  useThemeColors: () => ({ text: '#000', mutedText: '#666', accent: '#1f6f5b' }),
}));
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en' }) }));
// Text is built on rnHosts' host('span') plus its onTextLayout-aware wrapper,
// which is what routes it through rnHosts' testID/accessibilityState mapping
// (including the aria-expanded fix this task adds) and gives us `layout()`
// below to simulate Android's text measurement. See reactNativeTextMock's
// doc comment in rnHosts.ts for why the registry exists and why this factory
// reaches it via a dynamic import.
vi.mock('react-native', async () => {
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return reactNativeTextMock();
});

/** Fire onTextLayout with the lines Android would report for a clamp that DID
 *  truncate: six rendered lines whose joined text is shorter than the source. */
function layout(node: HTMLElement, shown: string[]) {
  (RN as unknown as { __fireLayout: (node: HTMLElement, shown: string[]) => void }).__fireLayout(
    node,
    shown,
  );
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
