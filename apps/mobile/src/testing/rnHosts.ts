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
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
  accessibilityRole?: string;
  accessibilityState?: { disabled?: boolean; selected?: boolean; expanded?: boolean };
  children?: React.ReactNode;
  onPress?: () => void;
  role?: string;
  style?: unknown;
  testID?: string;
  // Native-only props with no DOM equivalent. Destructured so they never reach
  // createElement: React logs "Unknown event handler property" for onLayout and
  // onTextLayout, and a non-boolean-attribute warning for `accessible` and
  // pointerEvents, on every render.
  accessible?: unknown;
  contentContainerStyle?: unknown;
  importantForAccessibility?: unknown;
  numberOfLines?: unknown;
  onLayout?: unknown;
  onTextLayout?: unknown;
  pointerEvents?: unknown;
}

/** RN accepts `style={[a, b]}`; the DOM does not. */
function flattenStyle(style: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(style)) return style as Record<string, unknown> | undefined;
  return Object.assign({}, ...style.flat(Infinity).filter(Boolean));
}

/** The `nativeEvent.lines` shape Android's `onTextLayout` reports. */
export type LayoutHandler = (event: { nativeEvent: { lines: { text: string }[] } }) => void;

/**
 * A `react-native` mock whose `Text` is `host('span')` plus an
 * `onTextLayout`-aware wrapper, for suites that need to simulate a text
 * measurement (`ClampedText` and anything that renders it, e.g.
 * `DefinitionCard` and the screens that embed either).
 *
 * jsdom's `MouseEvent` constructor silently drops init keys it doesn't
 * recognise, so a `fireEvent.click(node, { nativeEvent: {...} })` never makes
 * it to `event.nativeEvent` the way it would on a real synthetic click --
 * there is no DOM channel for RN's `onTextLayout` payload. `__layoutHandlers`
 * is the substitute: it remembers each rendered `Text`'s current
 * `onTextLayout` by the same testID the DOM node carries, and `__fireLayout`
 * looks a handler up by a node's testID and calls it directly, so callers
 * still wrap it in `act()` for the resulting setState to flush.
 *
 * Return this from a `vi.mock('react-native', async () => {...})` factory:
 * the factory is hoisted above every static import and can only reach this
 * module via `await import('@/testing/rnHosts.js')` -- see the module-level
 * comment above for why the extension is required.
 */
export function reactNativeTextMock() {
  const layoutHandlers = new Map<string, LayoutHandler>();
  const HostText = host('span');
  const Text = ({
    onTextLayout,
    ...rest
  }: Record<string, unknown> & { onTextLayout?: LayoutHandler; testID?: string }) => {
    const testID = rest.testID as string | undefined;
    if (testID && onTextLayout) layoutHandlers.set(testID, onTextLayout);
    return React.createElement(HostText, rest);
  };
  // `node`'s type stays structural, not `HTMLElement`: this file is compiled
  // under the app tsconfig, which has no "DOM" lib (RN has no DOM), while the
  // callers below live under tsconfig.test.json, which does.
  const fireLayout = (node: { dataset: { testid?: string } }, shownLines: string[]) => {
    layoutHandlers.get(node.dataset.testid ?? '')?.({
      nativeEvent: { lines: shownLines.map((text) => ({ text })) },
    });
  };
  return {
    Text,
    View: host('div'),
    Pressable: host('button'),
    __layoutHandlers: layoutHandlers,
    __fireLayout: fireLayout,
  };
}

export function host(tag: string) {
  return function Host({
    accessibilityLabel,
    accessibilityLiveRegion,
    accessibilityRole,
    accessibilityState,
    children,
    onPress,
    role,
    style,
    testID,
    accessible: _accessible,
    contentContainerStyle: _contentContainerStyle,
    importantForAccessibility: _importantForAccessibility,
    numberOfLines: _numberOfLines,
    onLayout: _onLayout,
    onTextLayout: _onTextLayout,
    pointerEvents: _pointerEvents,
    ...props
  }: HostProps) {
    return React.createElement(
      tag,
      {
        ...props,
        'aria-label': accessibilityLabel,
        // Mapped, not dropped: an error a screen reader must announce after
        // the tap that caused it is exactly the kind of thing a test should be
        // able to assert on. RN spells the off state 'none'; ARIA spells it
        // 'off'.
        'aria-live':
          accessibilityLiveRegion === 'none' ? 'off' : accessibilityLiveRegion,
        // Mapped rather than spread: React warns about an unknown
        // accessibilityState attribute on a DOM node, and mapping it is what
        // lets a test see the state a control announces.
        'aria-disabled': accessibilityState?.disabled,
        'aria-selected': accessibilityState?.selected,
        'aria-expanded': accessibilityState?.expanded,
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
