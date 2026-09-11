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
  accessibilityState?: { disabled?: boolean; selected?: boolean; checked?: boolean; expanded?: boolean };
  children?: React.ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  role?: string;
  style?: unknown;
  testID?: string;
  hitSlop?: unknown;
  // Native-only props with no DOM equivalent. Destructured so they never reach
  // createElement: React logs "Unknown event handler property" for onLayout and
  // onTextLayout, and a non-boolean-attribute warning for `accessible`, on
  // every render. `pointerEvents` is destructured too, but mapped rather than
  // dropped -- see below.
  accessible?: unknown;
  // iOS's half of the hide-from-screen-readers pair, alongside Android's
  // importantForAccessibility. Dropped rather than mapped: React lowercases it
  // into an unknown DOM attribute, and the Android prop below is the one a
  // test can assert on.
  accessibilityElementsHidden?: unknown;
  contentContainerStyle?: unknown;
  // Reanimated's layout-animation builders, on an Animated.View. Nothing in
  // jsdom can run one, and spread onto a DOM node React warns about all three
  // on every render of either entry screen or any ayah.
  entering?: unknown;
  exiting?: unknown;
  layout?: unknown;
  horizontal?: unknown;
  importantForAccessibility?: unknown;
  onContentSizeChange?: unknown;
  showsHorizontalScrollIndicator?: unknown;
  // Mapped to data-lines below, not dropped: the dense word-by-word layout IS
  // its one-line gloss clamp, and a shim that swallows numberOfLines leaves
  // that assertion vacuous -- it would pass against a two-line gloss too.
  numberOfLines?: number;
  onLayout?: unknown;
  onTextLayout?: unknown;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  renderToHardwareTextureAndroid?: boolean;
}

/** RN accepts `style={[a, b]}`; the DOM does not.
 *
 *  A Pressable also accepts `style={(state) => ...}` and calls it itself with
 *  the press state. List rows use that form, because it is press feedback that
 *  costs no animation node per row, and a function handed straight to the DOM
 *  is stringified -- React then rejects it with "The `style` prop expects a
 *  mapping from style properties to values, not a string", which names neither
 *  the component nor the prop's real shape. Resolved at rest, since nothing in
 *  jsdom is holding a finger down. */
function flattenStyle(style: unknown): Record<string, unknown> | undefined {
  const resolved = typeof style === 'function' ? (style as (state: { pressed: boolean }) => unknown)({ pressed: false }) : style;
  const flat = (
    Array.isArray(resolved)
      ? Object.assign({}, ...resolved.flat(Infinity).filter(Boolean))
      : resolved
  ) as Record<string, unknown> | undefined;
  return withTransform(withBoxShadow(flat));
}

/**
 * RN's `transform` array expressed as a CSS transform string.
 *
 * Same blindness as the shadow props below: React assigns the style object
 * onto `node.style`, and an ARRAY there stringifies to something jsdom throws
 * away, so a rotated chevron and an unrotated one looked identical to the
 * suite. Every animated rotation and press-scale in the app rides on this
 * prop, so a test that could not read it could not defend any of them.
 *
 * Not a faithful CSS rendering of RN's transform model -- it only has to
 * differ when the inputs differ, and to be parseable by the assertion that
 * reads it.
 */
function withTransform(
  flat: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!flat || !Array.isArray(flat.transform)) return flat;
  const css = (flat.transform as Record<string, unknown>[])
    .flatMap((entry) => Object.entries(entry).map(([fn, value]) => `${fn}(${String(value)})`))
    .join(' ');
  return { ...flat, transform: css };
}

/** `includeFontPadding` as a string the DOM can hold, or undefined when the
 *  style does not set it. See the attribute it feeds, in `host` below. */
function includeFontPaddingOf(style: unknown): string | undefined {
  const flat = flattenStyle(style) as Record<string, unknown> | undefined;
  const value = flat?.includeFontPadding;
  return value === undefined ? undefined : String(value);
}

/**
 * RN's shadow props expressed as a `boxShadow` the DOM can hold.
 *
 * React puts the style object straight onto `node.style`, where
 * `shadowOpacity` and `elevation` are simply not properties -- they vanish
 * without a warning. So no test could see a shadow at all, in either
 * direction: a surface given the wrong depth and a surface given none looked
 * identical to the suite. This is the same shape of blindness as `accessible`
 * on a View, and the reason the tab bar shipped four sub-phases flat.
 *
 * The value is not a faithful CSS rendering of RN's shadow model -- it does not
 * need to be. It only has to differ when the inputs differ.
 */
function withBoxShadow(flat: Record<string, unknown> | undefined) {
  if (!flat) return flat;
  const { shadowOpacity, shadowRadius, shadowOffset, elevation } = flat;
  if (shadowOpacity === undefined && shadowRadius === undefined && elevation === undefined) {
    return flat;
  }
  const offset = (shadowOffset ?? { width: 0, height: 0 }) as { width: number; height: number };
  // Valid CSS, because jsdom parses the value and drops anything it cannot
  // read -- which would put us back where we started. Elevation rides in the
  // blur radius, since Android's shadow is drawn from elevation alone and CSS
  // has nowhere else to put it.
  const blur = Number(shadowRadius ?? 0) + Number(elevation ?? 0);
  return {
    ...flat,
    boxShadow: `${offset.width}px ${offset.height}px ${blur}px rgba(0, 0, 0, ${Number(
      shadowOpacity ?? 0,
    )})`,
  };
}

/**
 * A Modal that renders its children inline when visible, and nothing when not.
 *
 * The real one opens a separate native window, which jsdom has no counterpart
 * for. Honouring `visible` rather than always rendering: a hidden Modal's
 * children are not on screen, and a shim that renders them anyway would let a
 * suite assert on a sheet the user cannot see.
 */
export function Modal({ children, visible = true }: { children?: React.ReactNode; visible?: boolean }) {
  return visible ? React.createElement(React.Fragment, null, children) : null;
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
    AccessibilityInfo,
    AppState,
    FlatList,
    Modal,
    ScrollView: host('div'),
    SectionList,
    StyleSheet,
    useWindowDimensions,
    __layoutHandlers: layoutHandlers,
    __fireLayout: fireLayout,
  };
}

/**
 * A `react-native-gesture-handler` stand-in, for `vi.mock('react-native-gesture-handler')`.
 *
 * The real package does not parse under vitest, and its `Gesture.Pan()` is a
 * fluent builder -- `.runOnJS(true).minDistance(0).onUpdate(fn)` -- so a mock
 * has to return something chainable from every call. Rather than enumerate the
 * fifteen-odd builder methods (and grow the list the first time a component
 * reaches for a sixteenth), any method returns the chain, and any `on*` one
 * also records its handler.
 *
 * That recording is the point: `GestureDetector` renders nothing, so a
 * captured handler is the only way a suite can drive a drag. Read them off
 * `__gestureHandlers` by builder-method name, e.g. `.get('onEnd')`.
 */
export function reactNativeGestureHandlerMock() {
  const handlers = new Map<string, (event: never) => void>();

  function builder() {
    const chain: unknown = new Proxy(
      {},
      {
        get: (_target, method: string) => (argument: unknown) => {
          if (method.startsWith('on') && typeof argument === 'function') {
            handlers.set(method, argument as (event: never) => void);
          }
          return chain;
        },
      },
    );
    return chain;
  }

  const passthrough = ({ children }: { children?: React.ReactNode }) => children;

  return {
    GestureDetector: passthrough,
    // The sheet mounts its own root inside its Modal -- see BottomSheet.
    GestureHandlerRootView: passthrough,
    Gesture: { Pan: builder, Tap: builder },
    __gestureHandlers: handlers,
  };
}

/**
 * The three StyleSheet members components actually reach for.
 *
 * Here rather than in one suite because the alternative is a component being
 * rewritten to avoid `StyleSheet.absoluteFill` for the sake of a test -- the
 * shim exists so the app can be written the way React Native is written. Both
 * `create` and `flatten` are identity-ish on purpose: RN returns opaque style
 * IDs, `host` above flattens arrays itself, and nothing here asserts on a
 * registry handle.
 */
export const StyleSheet = {
  absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const,
  absoluteFillObject: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const,
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: flattenStyle,
  hairlineWidth: 1,
};

interface LayoutEvent {
  nativeEvent: { layout: { width: number; height: number; x: number; y: number } };
}

let autoLayout: { width: number; height: number } | null = null;

/**
 * Make every shimmed host fire `onLayout` once on mount, with this box.
 *
 * Off by default, and opt-in per suite rather than global: jsdom lays nothing
 * out, so a component's width-driven branches are dead in tests unless
 * something fires the measurement -- but switching it on everywhere changes
 * what components that do their own layout maths see (BottomSheet computes its
 * dismiss threshold from the measured height), and those suites are asserting
 * on real behaviour with their own fixtures. A suite that needs a measured box
 * asks for one and clears it after.
 *
 * Added for SegmentedControl, whose press handler defers `onChange` only once
 * the row has a width. With no measurement it took the unmeasured path on
 * every render, so the deferral shipped untested behind a green suite
 * (2026-08-31).
 */
export function setAutoLayout(size: { width: number; height: number } | null) {
  autoLayout = size;
}

export function host(tag: string) {
  return function Host({
    accessibilityLabel,
    accessibilityLiveRegion,
    accessibilityRole,
    accessibilityState,
    children,
    onPress,
    onLongPress,
    role,
    style,
    testID,
    accessible: _accessible,
    accessibilityElementsHidden: _accessibilityElementsHidden,
    contentContainerStyle: _contentContainerStyle,
    entering: _entering,
    exiting: _exiting,
    layout: _layout,
    horizontal: _horizontal,
    importantForAccessibility,
    onContentSizeChange: _onContentSizeChange,
    showsHorizontalScrollIndicator: _showsHorizontalScrollIndicator,
    numberOfLines,
    onLayout,
    onPressIn,
    onPressOut,
    onTextLayout: _onTextLayout,
    pointerEvents,
    hitSlop,
    renderToHardwareTextureAndroid,
    ...props
  }: HostProps) {
    // Fires only when a suite has asked for a measured box; see setAutoLayout.
    React.useEffect(() => {
      if (autoLayout === null || typeof onLayout !== 'function') return;
      (onLayout as (event: LayoutEvent) => void)({
        nativeEvent: { layout: { ...autoLayout, x: 0, y: 0 } },
      });
    }, [onLayout]);

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
        // `checked` as well as `selected`: RN's radio role carries selection in
        // `checked`, and a shim that mapped only `selected` left every
        // radiogroup in the app assertable on the wrong half of its own state.
        'aria-checked': accessibilityState?.checked,
        'aria-expanded': accessibilityState?.expanded,
        // `role` wins: it is the cross-platform prop, and components that set
        // it (role="dialog") leave accessibilityRole undefined, which would
        // otherwise overwrite it with nothing.
        role: role ?? accessibilityRole,
        'data-testid': testID,
        'data-lines': numberOfLines === undefined ? undefined : String(numberOfLines),
        // A data- attribute, not the camelCase prop: React warns about an
        // unknown DOM attribute. It is Android's only way to take a subtree
        // away from TalkBack behind a sheet (accessibilityViewIsModal is
        // iOS-only), so a test has to be able to see it.
        'data-hidden-from-a11y': importantForAccessibility === 'no-hide-descendants' ? 'true' : undefined,
        // Mapped for the same reason, and it was dropped until the reader's
        // cross-fade handed every touch to a layer at opacity 0: which view
        // takes a tap is behaviour, and there is no DOM equivalent to assert
        // against. React warns about the camelCase prop on a DOM node.
        'data-pointer-events': pointerEvents === undefined ? undefined : String(pointerEvents),
        // Mapped rather than spread, same reason again: React warns about the
        // camelCase prop on a DOM node, and dropping it would make the one
        // assertion that the mushaf page is held as GPU pixels decorative.
        'data-hardware-layer': renderToHardwareTextureAndroid ? 'true' : undefined,
        // Mapped, not spread: it is an object, so React would render it as an
        // unknown attribute and warn. It is also the only thing standing
        // between a control's drawn height and the 48dp its finger needs
        // (§8), and a parent's padding does not extend a hit area -- so a
        // control that shrank below the floor and forgot this is exactly the
        // regression a suite has to be able to see.
        'data-hit-slop':
          hitSlop === undefined ? undefined : JSON.stringify(hitSlop),
        // Android-only, and not a CSS property: React drops it onto node.style
        // where it simply vanishes, so a Text given the padding and a Text
        // denied it looked identical to the suite. Same blindness as
        // `shadowOpacity` above, and the reason the hero word carried 54dp of
        // invisible band for a phase. Read it with
        // `node.getAttribute('data-rn-include-font-padding')`.
        'data-rn-include-font-padding': includeFontPaddingOf(style),
        onClick: onPress,
        // RN's press phases, mapped onto the nearest DOM events rather than
        // spread (React logs "does not recognize the onPressIn prop" for every
        // card on every render) and rather than dropped, which is what they
        // were until M7d. Dropping a prop makes every assertion about it
        // decorative -- the rnHosts lesson, learned on `accessible` and again
        // on a sheet's own props -- and the mushaf's long press is now the only
        // way to open the word sheet, so it is exactly the prop a suite must be
        // able to fire. onContextMenu is the DOM's long press.
        onContextMenu: onLongPress,
        onMouseDown: onPressIn,
        onMouseUp: onPressOut,
        style: flattenStyle(style),
      },
      children,
    );
  };
}

/** FlatList and SectionList, rendered eagerly and in full.
 *
 *  The real ones virtualize, which in jsdom means measuring a viewport that has
 *  no height and rendering nothing -- every assertion then fails on an empty
 *  list rather than on the component. Rendering everything is the point: a
 *  suite asserting on the 604th row wants the 604th row.
 *
 *  `keyExtractor` is honoured rather than ignored so a duplicate-key bug still
 *  surfaces as a React warning, and section headers render through the same
 *  path the device uses. Sections themselves key by index, not by title: two
 *  sections may legitimately share a title (a chronology that stops being two
 *  contiguous blocks yields alternating Meccan/Medinan ones), and keying by it
 *  would swallow that as a duplicate-key warning instead of rendering it.
 */
/** The prop bag of every rendered mock list, by its host node.
 *
 *  A `FlatList` carries a dozen props that render nothing -- `inverted`,
 *  `pagingEnabled`, `getItemLayout`, `onMomentumScrollEnd`, `windowSize` --
 *  and every one of them is load-bearing on device. Destructuring only the
 *  props the mock draws with silently drops the rest, and an assertion on a
 *  dropped prop passes whether or not the component sets it. Same shape as
 *  `accessible` collapsing its children: a prop the mock eats is a prop no
 *  unit test can defend.
 *
 *  So the whole bag is kept, and `listPropsOf` reads it back.
 */
const listProps = new WeakMap<object, ListHostProps>();

/** One imperative scroll a component asked its list for. */
export interface ScrollCall {
  index?: number;
  offset?: number;
  animated?: boolean;
}

const listScrolls = new WeakMap<object, ScrollCall[]>();

interface ListHostProps {
  data?: readonly unknown[];
  renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
  keyExtractor?: (item: unknown, index: number) => string;
  // Forwarded so a suite can assert WHICH container a screen used. "The rows
  // are a virtualizing list, not a plain View" is a real regression -- it is
  // how rows past the first screenful became unreachable on device -- and it
  // is not observable from the rows themselves.
  testID?: string;
  // Typed rather than left to the index signature: these are the props the
  // mushaf pager is entirely made of, and `unknown` is not callable, so a
  // suite could not assert on them at all.
  getItemLayout?: (data: unknown, index: number) => { length: number; offset: number; index: number };
  onMomentumScrollEnd?: (event: { nativeEvent: { contentOffset: { x: number; y: number } } }) => void;
  [prop: string]: unknown;
}

/** Every prop the component handed its list, including the ones that draw
 *  nothing. Throws rather than guessing when a render holds no list or more
 *  than one -- both mean the assertion about to run is not the one intended. */
export function listPropsOf(result: {
  // Structural, not `Element`: this file is compiled without the DOM lib (the
  // app it mocks has no DOM), and the only thing needed off the container is
  // the query.
  container: { querySelectorAll(selector: string): ArrayLike<object> };
}): ListHostProps {
  const nodes = result.container.querySelectorAll('[data-rn-list]');
  if (nodes.length !== 1) {
    throw new Error(`listPropsOf: expected exactly one list in the render, found ${nodes.length}`);
  }
  const props = listProps.get(nodes[0]!);
  if (!props) throw new Error('listPropsOf: the list node carries no recorded props');
  return props;
}

/** The imperative scrolls the component asked its list for, oldest first.
 *  Same contract as listPropsOf: exactly one list in the render. */
export function listScrollsOf(result: {
  container: { querySelectorAll(selector: string): ArrayLike<object> };
}): ScrollCall[] {
  const nodes = result.container.querySelectorAll('[data-rn-list]');
  if (nodes.length !== 1) {
    throw new Error(`listScrollsOf: expected exactly one list in the render, found ${nodes.length}`);
  }
  return listScrolls.get(nodes[0]!) ?? [];
}

/** FlatList and SectionList, rendered eagerly and in full.
 *
 *  The real ones virtualize, which in jsdom means measuring a viewport that has
 *  no height and rendering nothing -- every assertion then fails on an empty
 *  list rather than on the component. Rendering everything is the point: a
 *  suite asserting on the 604th row wants the 604th row.
 *
 *  `keyExtractor` is honoured rather than ignored so a duplicate-key bug still
 *  surfaces as a React warning, and section headers render through the same
 *  path the device uses. Sections themselves key by index, not by title: two
 *  sections may legitimately share a title (a chronology that stops being two
 *  contiguous blocks yields alternating Meccan/Medinan ones), and keying by it
 *  would swallow that as a duplicate-key warning instead of rendering it.
 */
export function FlatList(props: ListHostProps) {
  const { data, renderItem, keyExtractor, testID } = props;
  // The imperative half of a list, kept for the same reason the prop bag is:
  // a component that jumps the list -- the mushaf pager turning to the ayah
  // being recited -- does it through the ref, and a mock that swallows the ref
  // makes every assertion about that jump pass whether or not it happens.
  const calls = React.useRef<ScrollCall[]>([]).current;
  const handle = React.useRef({
    scrollToIndex: (params: ScrollCall) => calls.push(params),
    scrollToOffset: (params: ScrollCall) => calls.push(params),
  }).current;
  React.useImperativeHandle(props['ref'] as React.Ref<unknown>, () => handle);

  return React.createElement(
    'div',
    {
      'data-testid': testID,
      'data-rn-list': '',
      ref: (node: object | null) => {
        if (node) {
          listProps.set(node, props);
          listScrolls.set(node, calls);
        }
      },
    },
    (data ?? []).map((item, index) =>
      React.createElement('div', { key: keyExtractor?.(item, index) ?? index }, renderItem({ item, index })),
    ),
  );
}

export function SectionList({
  sections,
  renderItem,
  renderSectionHeader,
  keyExtractor,
  testID,
}: {
  sections?: readonly { title: string; data: readonly unknown[] }[];
  renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
  renderSectionHeader?: (info: { section: { title: string; data: readonly unknown[] } }) => React.ReactNode;
  keyExtractor?: (item: unknown, index: number) => string;
  /** See FlatList above. */
  testID?: string;
}) {
  return React.createElement(
    'div',
    { 'data-testid': testID },
    (sections ?? []).map((section, sectionIndex) =>
      React.createElement(
        'div',
        { key: sectionIndex },
        renderSectionHeader?.({ section }),
        section.data.map((item, index) =>
          React.createElement('div', { key: keyExtractor?.(item, index) ?? index }, renderItem({ item, index })),
        ),
      ),
    ),
  );
}

/** Inert AccessibilityInfo reporting "reduce motion off".
 *
 *  Here for the same reason as AppState below: usePressScale reaches
 *  useReducedMotion, which reads this on mount, so every component that
 *  squeezes on press now needs it -- and without it the suite fails on
 *  `AccessibilityInfo is undefined` rather than on anything naming the
 *  component. Off rather than on so the press branch under test is the one
 *  users get; the reduced-motion branch is covered purely in
 *  motion/usePressScale.test.ts.
 */
export const AccessibilityInfo = {
  isReduceMotionEnabled: async () => false,
  addEventListener: () => ({ remove: () => {} }),
};

/** A 390x844 window -- the frame every M6 mockup is drawn at.
 *
 *  Here rather than per suite for the same reason AccessibilityInfo is: the
 *  entry-screen pager measures the window to slide the incoming entry a full
 *  width, so both dictionary screens now reach it, and a suite without it
 *  fails on `useWindowDimensions is not a function` rather than on anything
 *  naming the screen. A suite that cares about the number declares its own.
 */
export const useWindowDimensions = () => ({ width: 390, height: 844, scale: 3, fontScale: 1 });

/** Inert AppState for suites that mock react-native wholesale.
 *
 *  useUserDbOnFocus subscribes to it on every focus, so every screen that
 *  reads the user DB now reaches it -- without this each of those suites fails
 *  on `AppState is undefined` rather than on anything naming the screen. A
 *  suite that wants to *drive* a resume declares its own controllable stub;
 *  this one only has to exist.
 */
export const AppState = {
  addEventListener: () => ({ remove: () => {} }),
};
