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

  it('does not let the initial read overwrite an event that already landed', async () => {
    // TalkBack switched on between subscribe() and the initial read resolving:
    // the event says true, then the stale promise says false LAST. Reported
    // off with a screen reader running, the reader never wakes its cards and
    // every word announces as raw Arabic until TalkBack is toggled again.
    vi.resetModules();
    let resolveRead: (value: boolean) => void = () => {};
    isScreenReaderEnabled.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => { resolveRead = resolve; }),
    );

    const { useScreenReaderEnabled: fresh } = await import('./useScreenReaderEnabled.js');
    const { result } = renderHook(() => fresh());
    const handler = addEventListener.mock.calls.at(-1)?.[1] as (value: boolean) => void;

    handler(true);
    await waitFor(() => expect(result.current).toBe(true));

    // The read was in flight the whole time and answers with what was true
    // before the switch. It is older than the event, so it loses.
    resolveRead(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBe(true);
  });
});
