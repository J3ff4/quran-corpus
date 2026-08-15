// Telemetry is a trust boundary: everything that reaches these providers leaves
// the device for a third party. So the rule here is allowlist by *value*, not by
// key. A key-only filter still let a caller push arbitrary text through an
// approved field -- `source: <a user's note>` passed the old filter untouched --
// and forwarded raw event names and raw Error objects, whose messages and stacks
// routinely carry file paths, URLs and query strings.
//
// Nothing consumes this module yet (both providers are null; M4 wires them up).
// Getting the shape right while it has no callers is the cheap moment.

type TelemetryValue = string | number | boolean | null | undefined;
export type TelemetryProperties = Record<string, TelemetryValue>;

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

/** Every event name that may be sent. Free-form names are dropped. */
export const telemetryEvents = [
  'app_opened',
  'reader_ayah_opened',
  'reader_audio_played',
  'bookmark_toggled',
  'setting_changed',
] as const;
export type TelemetryEvent = (typeof telemetryEvents)[number];

/**
 * Error identifiers we are willing to report.
 *
 * The raw Error never leaves: we send one of these codes instead, so a message
 * or stack cannot smuggle a path or URL out with it. The cost is that a report
 * says what broke but not where -- acceptable while there is no provider, and
 * the upgrade path is an explicit scrubber, not re-forwarding the raw error.
 */
export const telemetryErrorCodes = [
  'corpus_db_open_failed',
  'user_db_write_failed',
  'audio_fetch_failed',
  'settings_persist_failed',
  'unknown',
] as const;
export type TelemetryErrorCode = (typeof telemetryErrorCodes)[number];

const languageCodes = ['en', 'uz', 'ru'];
const themes = ['system', 'light', 'dark'];
const screens = ['home', 'surahs', 'bookmarks', 'settings', 'reader', 'about'];
const sources = ['bundled_db', 'user_db', 'audio_endpoint'];

function isOneOf(allowed: readonly string[]) {
  return (value: TelemetryValue) => typeof value === 'string' && allowed.includes(value);
}

function isIntInRange(min: number, max: number) {
  return (value: TelemetryValue) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isBoolean(value: TelemetryValue) {
  return typeof value === 'boolean';
}

// A property survives only if its key is listed *and* its value satisfies the
// validator. Anything else is dropped silently -- telemetry must never be the
// reason a user-facing path throws.
const propertyValidators: Record<string, (value: TelemetryValue) => boolean> = {
  surah: isIntInRange(1, 114),
  ayah: isIntInRange(1, 286), // 286 = al-Baqarah, the longest surah
  language: isOneOf(languageCodes),
  uiLocale: isOneOf(languageCodes),
  contentLanguage: isOneOf(languageCodes),
  theme: isOneOf(themes),
  analyticsEnabled: isBoolean,
  audioEnabled: isBoolean,
  screen: isOneOf(screens),
  source: isOneOf(sources),
};

// `unknown` rather than TelemetryProperties: the types say callers pass an
// object, but this is a trust boundary and callers may be plain JS. `null`
// reaches Object.entries and throws, which would take down whatever
// user-facing path emitted the event -- telemetry must fail quiet, not loud.
export function sanitizeProperties(properties: unknown = {}): TelemetryProperties {
  if (properties === null || typeof properties !== 'object') return {};

  try {
    return Object.fromEntries(
      // hasOwn before the lookup: a plain object literal inherits from
      // Object.prototype, so keys like `toString`, `valueOf` or `constructor`
      // resolve to an inherited function, get called, return something truthy,
      // and survive the filter -- the key-only bypass this table exists to stop.
      Object.entries(properties as TelemetryProperties).filter(
        ([key, value]) => Object.hasOwn(propertyValidators, key) && (propertyValidators[key]?.(value) ?? false),
      ),
    );
  } catch {
    // Object.entries *reads* every enumerable property, so an object carrying a
    // getter that throws takes the whole call down -- the null guard above does
    // not cover it, because such an object is a perfectly ordinary non-null
    // object. Same rule as everywhere else here: drop the payload, never let
    // telemetry be the reason a user-facing path fails.
    return {};
  }
}

export function createTelemetry({ posthog, sentry }: TelemetryProviders) {
  return {
    captureEvent(name: TelemetryEvent, properties?: TelemetryProperties) {
      // Checked at runtime as well as in the types: callers may be JS, and an
      // unknown name is exactly how a free-form string would get through.
      if (!(telemetryEvents as readonly string[]).includes(name)) return;
      posthog?.capture(name, sanitizeProperties(properties));
    },
    captureException(code: TelemetryErrorCode, context?: TelemetryProperties) {
      const safeCode = (telemetryErrorCodes as readonly string[]).includes(code) ? code : 'unknown';
      sentry?.captureException(new Error(safeCode), { extra: sanitizeProperties(context) });
    },
  };
}

export const telemetry = createTelemetry({ posthog: null, sentry: null });
