import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useScreenReaderEnabled } from './useScreenReaderEnabled.js';

const isScreenReaderEnabled = vi.fn(async () => true);
const addEventListener = vi.fn((_event: string, _handler: (value: boolean) => void) => ({
  remove: () => {},
}));

vi.mock('react-native', () => ({
  AccessibilityInfo: {
    get isScreenReaderEnabled() {
      return isScreenReaderEnabled;
    },
    get addEventListener() {
      return addEventListener;
    },
  },
}));

describe('useScreenReaderEnabled', () => {
  it('reports the device flag once it resolves', async () => {
    const { result } = renderHook(() => useScreenReaderEnabled());

    // False until the async read lands. Defaulting true would put the word
    // rows back into every reader render on every launch.
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('reads the device once for the whole app, however many callers there are', async () => {
    // Same reason as useReducedMotion: a per-caller read fires one native
    // call and one listener per mounted component, and wakes each of them
    // separately as its own read resolves.
    renderHook(() => useScreenReaderEnabled());
    renderHook(() => useScreenReaderEnabled());

    await waitFor(() => expect(isScreenReaderEnabled).toHaveBeenCalledTimes(1));
    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledWith('screenReaderChanged', expect.any(Function));
  });
});
