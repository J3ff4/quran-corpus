type TelemetryProperties = Record<string, string | number | boolean | null | undefined>;

interface PostHogLike {
  capture: (name: string, properties?: TelemetryProperties) => void;
}

interface SentryLike {
  captureException: (error: unknown, context?: { extra?: TelemetryProperties }) => void;
}

interface TelemetryProviders {
  posthog: PostHogLike | null;
  sentry: SentryLike | null;
}

const deniedPropertyKeys = new Set(['text', 'query', 'note', 'arabicText', 'translationText', 'rawInput']);

function sanitizeProperties(properties: TelemetryProperties = {}): TelemetryProperties {
  return Object.fromEntries(Object.entries(properties).filter(([key]) => !deniedPropertyKeys.has(key)));
}

export function createTelemetry({ posthog, sentry }: TelemetryProviders) {
  return {
    captureEvent(name: string, properties?: TelemetryProperties) {
      posthog?.capture(name, sanitizeProperties(properties));
    },
    captureException(error: unknown, context?: TelemetryProperties) {
      sentry?.captureException(error, { extra: sanitizeProperties(context) });
    },
  };
}

export const telemetry = createTelemetry({ posthog: null, sentry: null });
