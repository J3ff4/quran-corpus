import React from 'react';

/**
 * DOM stand-ins for React Native's host components, for `vi.mock('react-native')`.
 *
 * Three suites had each grown their own copy and they had already drifted: two
 * mapped `accessibilityLabel` but none mapped `testID`, so `getByTestId` found
 * nothing and the fix would have had to be pasted a third time. The mappings
 * below are the whole reason these exist -- a raw prop spread renders
 * `accessibilityLabel` as an unknown DOM attribute, which no Testing Library
 * query can reach.
 *
 * Import it as `await import('@/testing/rnHosts.js')` -- with the extension.
 * A `vi.mock` factory can only reach it through a dynamic import, since the
 * factory is hoisted above every static one, and TypeScript resolves dynamic
 * imports in ESM mode, where an extensionless specifier does not resolve at
 * all. Worse, the failed resolution is cached per directory, so it takes every
 * other alias import in that folder down with it.
 */
interface HostProps {
  accessibilityLabel?: string;
  accessibilityRole?: string;
  accessibilityState?: { disabled?: boolean; selected?: boolean };
  children?: React.ReactNode;
  onPress?: () => void;
  role?: string;
  style?: unknown;
  testID?: string;
  // Native-only props with no DOM equivalent. Destructured so they never reach
  // createElement: React logs "Unknown event handler property" for onLayout and
  // a non-boolean-attribute warning for `accessible` and pointerEvents, on
  // every render.
  accessible?: unknown;
  contentContainerStyle?: unknown;
  onLayout?: unknown;
  pointerEvents?: unknown;
}

/** RN accepts `style={[a, b]}`; the DOM does not. */
function flattenStyle(style: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(style)) return style as Record<string, unknown> | undefined;
  return Object.assign({}, ...style.flat(Infinity).filter(Boolean));
}

export function host(tag: string) {
  return function Host({
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    children,
    onPress,
    role,
    style,
    testID,
    accessible: _accessible,
    contentContainerStyle: _contentContainerStyle,
    onLayout: _onLayout,
    pointerEvents: _pointerEvents,
    ...props
  }: HostProps) {
    return React.createElement(
      tag,
      {
        ...props,
        'aria-label': accessibilityLabel,
        // Mapped rather than spread: React warns about an unknown
        // accessibilityState attribute on a DOM node, and mapping it is what
        // lets a test see the state a control announces.
        'aria-disabled': accessibilityState?.disabled,
        'aria-selected': accessibilityState?.selected,
        // `role` wins: it is the cross-platform prop, and components that set
        // it (role="dialog") leave accessibilityRole undefined, which would
        // otherwise overwrite it with nothing.
        role: role ?? accessibilityRole,
        'data-testid': testID,
        onClick: onPress,
        style: flattenStyle(style),
      },
      children,
    );
  };
}
