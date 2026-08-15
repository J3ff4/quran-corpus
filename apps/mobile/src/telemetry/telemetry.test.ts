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

  it('drops PII smuggled through an approved key', () => {
    const posthog = { capture: vi.fn() };
    const telemetry = createTelemetry({ posthog: posthog as never, sentry: null });

    // `source` is on the allowlist, so a key-only filter forwarded this intact.
    telemetry.captureEvent('reader_ayah_opened', {
      source: 'user@example.com searched for something private',
      screen: '/Users/someone/secret/path',
      surah: 2,
    });

    expect(posthog.capture).toHaveBeenCalledWith('reader_ayah_opened', { surah: 2 });
  });

  it('drops properties named after inherited Object.prototype members', () => {
    const posthog = { capture: vi.fn() };
    const telemetry = createTelemetry({ posthog: posthog as never, sentry: null });

    // Looking the validator up without an own-property check finds these on
    // Object.prototype, calls them, and gets a truthy result -- so the value
    // rode straight through the allowlist.
    telemetry.captureEvent('reader_ayah_opened', {
      toString: '/data/user/0/com.qurancorpus.mobile/secret',
      valueOf: 'user@example.com',
      constructor: 'must not be sent',
      hasOwnProperty: 'must not be sent',
      surah: 3,
    } as never);

    expect(posthog.capture).toHaveBeenCalledWith('reader_ayah_opened', { surah: 3 });
  });

  it('drops a non-object payload instead of throwing at the call site', () => {
    const posthog = { capture: vi.fn() };
    const sentry = { captureException: vi.fn() };
    const telemetry = createTelemetry({ posthog: posthog as never, sentry: sentry as never });

    // A JS caller can pass null, and Object.entries(null) throws. Telemetry
    // sits inside user-facing paths, so it has to swallow this, not surface it.
    telemetry.captureEvent('app_opened', null as never);
    telemetry.captureException('unknown', 'not an object' as never);

    expect(posthog.capture).toHaveBeenCalledWith('app_opened', {});
    const [, context] = sentry.captureException.mock.calls[0] as [Error, { extra: unknown }];
    expect(context.extra).toEqual({});
  });

  it('drops out-of-range values for approved numeric keys', () => {
    const posthog = { capture: vi.fn() };
    const telemetry = createTelemetry({ posthog: posthog as never, sentry: null });

    telemetry.captureEvent('reader_ayah_opened', { surah: 999, ayah: -1 });

    expect(posthog.capture).toHaveBeenCalledWith('reader_ayah_opened', {});
  });

  it('drops unknown event names', () => {
    const posthog = { capture: vi.fn() };
    const telemetry = createTelemetry({ posthog: posthog as never, sentry: null });

    telemetry.captureEvent('user typed: my password is hunter2' as never, { surah: 1 });

    expect(posthog.capture).not.toHaveBeenCalled();
  });

  it('reports an error code instead of the raw error message and stack', () => {
    const sentry = { captureException: vi.fn() };
    const telemetry = createTelemetry({ posthog: null, sentry: sentry as never });

    telemetry.captureException('audio_fetch_failed', { surah: 1, token: 'secret' });

    const [reported, context] = sentry.captureException.mock.calls[0] as [Error, { extra: unknown }];
    expect(reported.message).toBe('audio_fetch_failed');
    expect(context.extra).toEqual({ surah: 1 });
  });

  it('falls back to the unknown code rather than forwarding an unlisted one', () => {
    const sentry = { captureException: vi.fn() };
    const telemetry = createTelemetry({ posthog: null, sentry: sentry as never });

    telemetry.captureException('ENOENT /home/someone/.ssh/id_rsa' as never);

    const [reported] = sentry.captureException.mock.calls[0] as [Error];
    expect(reported.message).toBe('unknown');
  });
});
