import { describe, expect, it, vi } from 'vitest';
import { createTelemetry } from './telemetry';

describe('telemetry', () => {
  it('allows only approved analytics properties', () => {
    const posthog = { capture: vi.fn() };
    const telemetry = createTelemetry({ posthog: posthog as never, sentry: null });

    telemetry.captureEvent('reader_ayah_opened', {
      surah: 1,
      ayah: 1,
      text: 'must not be sent',
      query: 'must not be sent',
      email: 'must not be sent',
    });

    expect(posthog.capture).toHaveBeenCalledWith('reader_ayah_opened', { surah: 1, ayah: 1 });
  });
});
