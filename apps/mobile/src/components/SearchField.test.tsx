import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const focusSpy = vi.fn();

vi.mock('react-native', async () => {
  const React = await import('react');
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return {
    ...reactNativeTextMock(),
    // forwardRef, because the clear button's whole contract is that it hands
    // focus straight back to the field (R8) -- a stub that drops the ref makes
    // that assertion untestable.
    TextInput: React.forwardRef(
      (
        { value, onChangeText, testID, accessibilityLabel }: Record<string, unknown>,
        ref: React.ForwardedRef<{ focus: () => void }>,
      ) => {
        React.useImperativeHandle(ref, () => ({ focus: focusSpy }));
        return React.createElement('input', {
          'data-testid': testID,
          'aria-label': accessibilityLabel,
          value: value as string,
          onChange: (event: { target: { value: string } }) =>
            (onChangeText as (next: string) => void)(event.target.value),
        });
      },
    ),
  };
});
vi.mock('react-native-svg', async () => {
  const React = await import('react');
  return {
    default: ({ children, testID }: Record<string, unknown>) =>
      React.createElement('svg', { 'data-testid': testID }, children as React.ReactNode),
    Path: () => null,
  };
});

import { SearchField } from './SearchField';

const base = {
  placeholder: 'Search',
  accessibilityLabel: 'Search',
  clearAccessibilityLabel: 'Clear search',
  testID: 'search-field',
  clearTestID: 'search-field-clear',
};

afterEach(() => {
  cleanup();
  focusSpy.mockClear();
});

describe('SearchField', () => {
  it('shows no clear button while the field is empty', () => {
    render(<SearchField {...base} value="" onChangeText={vi.fn()} />);
    expect(screen.queryByTestId('search-field-clear')).toBeNull();
  });

  it('shows the clear button once something is typed', () => {
    render(<SearchField {...base} value="baqara" onChangeText={vi.fn()} />);
    expect(screen.getByTestId('search-field-clear')).toBeTruthy();
  });

  it('clears the field and hands focus straight back to it', () => {
    const onChangeText = vi.fn();
    render(<SearchField {...base} value="baqara" onChangeText={onChangeText} />);
    fireEvent.click(screen.getByTestId('search-field-clear'));
    expect(onChangeText).toHaveBeenCalledWith('');
    // R8: the keyboard stays up, so the next keystroke goes into the field
    // rather than into a dismissed screen.
    expect(focusSpy).toHaveBeenCalled();
  });
});
