import React from 'react';

/** One imperative page turn a component asked the pager for. */
export interface PagerCommand {
  page: number;
  animated: boolean;
}

interface PagerHostProps {
  /** Forwarded so a suite can assert WHICH container a screen used -- the
   *  mushaf is a native pager, not a scroll view, and that is not observable
   *  from the pages themselves. */
  testID?: string;
  onPageSelected?: (event: { nativeEvent: { position: number } }) => void;
  onPageScrollStateChanged?: (event: {
    nativeEvent: { pageScrollState: 'idle' | 'dragging' | 'settling' };
  }) => void;
  children?: React.ReactNode;
  [prop: string]: unknown;
}

const pagerProps = new WeakMap<object, PagerHostProps>();
const pagerCommands = new WeakMap<object, PagerCommand[]>();

/**
 * A `react-native-pager-view` stand-in, for `vi.mock('react-native-pager-view')`.
 *
 * Same contract as rnHosts' list mock and for the same reason: PagerView
 * carries a bag of props that draw nothing -- `layoutDirection`,
 * `offscreenPageLimit`, `initialPage`, `overdrag` -- and every one of them is
 * load-bearing on the device. Destructuring only the ones the mock draws with
 * would silently drop the rest, and an assertion on a dropped prop passes
 * whether or not the component sets it.
 *
 * Children render eagerly and in full: the real pager lays out one page at a
 * time against a viewport jsdom does not have, so a suite asserting on the
 * page it turned to would find an empty container instead.
 */
export function pagerViewMock() {
  const PagerView = React.forwardRef<unknown, PagerHostProps>(function PagerView(props, ref) {
    // Only what the mock draws with. Everything else is read back off the
    // WeakMap rather than spread onto the div, where React would warn on every
    // unknown attribute -- and a prop the mock eats is a prop no unit test can
    // defend (rnHosts, same rule).
    // Cast because the index signature below widens every read off `props` to
    // `unknown`, children included.
    const children = props.children as React.ReactNode;
    const testID = props.testID;
    const node = React.useRef<object | null>(null);

    // Every render, not only when the ref fires: React calls a ref callback
    // once for a node it keeps, so recording there alone would freeze the
    // props at mount and every assertion after a state change would read the
    // first render's bag.
    React.useLayoutEffect(() => {
      if (node.current) pagerProps.set(node.current, props);
    });

    // ViewPager2 announces where it landed, and it announces its OPENING page
    // the same way -- `onPageSelected` fires once at attach carrying
    // `initialPage`, before anything has turned. A mock that stays silent until
    // a suite fires the event by hand lets a component read its own `settled`
    // state as never having been told anything, which is not a state the device
    // can be in. Both are modelled here: the mount event and the one every
    // imperative turn lands through.
    const select = React.useCallback((page: number) => {
      const handler = pagerProps.get(node.current ?? {})?.onPageSelected;
      handler?.({ nativeEvent: { position: page } });
    }, []);

    // A BARE selection, with no scroll state around it -- which is exactly what
    // a relayout emits, and is the weaker of the two sequences a programmatic
    // turn could produce. ViewPager2 is documented to pass through SETTLING for
    // `setCurrentItem(i, true)`, but that was not measured on device the way the
    // gesture and relayout traces were (2026-10-01), so the double models the
    // case that assumes nothing: a consumer that only survives here because
    // Android volunteered a state change does not survive here at all.

    React.useImperativeHandle(ref, () => ({
      setPage: (page: number) => {
        if (node.current) pagerCommands.get(node.current)?.push({ page, animated: true });
        select(page);
      },
      setPageWithoutAnimation: (page: number) => {
        if (node.current) pagerCommands.get(node.current)?.push({ page, animated: false });
        select(page);
      },
    }));

    // Once per mount, after the props above are recorded. A remount -- which is
    // what a mushaf mode flip does, through `key` -- is a fresh mount and fires
    // it again, which is exactly the event a rotation has to survive.
    const opened = React.useRef(false);
    React.useEffect(() => {
      if (opened.current) return;
      opened.current = true;
      select(typeof props.initialPage === 'number' ? props.initialPage : 0);
      // Mount only, which is the whole point: the opening page is announced
      // once per mounted pager. `opened` guards a re-run anyway, so the deps
      // list is documentation rather than control.
    });

    return (
      <div
        data-rn-pager=""
        data-testid={testID}
        ref={(element: object | null) => {
          node.current = element;
          if (!element) return;
          pagerProps.set(element, props);
          if (!pagerCommands.has(element)) pagerCommands.set(element, []);
        }}
      >
        {children}
      </div>
    );
  });

  return { __esModule: true, default: PagerView };
}

const singlePager = (
  result: { container: { querySelectorAll(selector: string): ArrayLike<object> } },
  caller: string,
): object => {
  const nodes = result.container.querySelectorAll('[data-rn-pager]');
  if (nodes.length !== 1) {
    throw new Error(`${caller}: expected exactly one pager in the render, found ${nodes.length}`);
  }
  return nodes[0]!;
};

/** Every prop the component handed its pager, including the ones that draw
 *  nothing. Throws rather than guessing when a render holds no pager or more
 *  than one -- both mean the assertion about to run is not the one intended. */
export function pagerPropsOf(result: {
  container: { querySelectorAll(selector: string): ArrayLike<object> };
}): PagerHostProps {
  const props = pagerProps.get(singlePager(result, 'pagerPropsOf'));
  if (!props) throw new Error('pagerPropsOf: the pager node carries no recorded props');
  return props;
}

/** The imperative turns the component asked its pager for, oldest first. */
export function pagerCommandsOf(result: {
  container: { querySelectorAll(selector: string): ArrayLike<object> };
}): PagerCommand[] {
  return pagerCommands.get(singlePager(result, 'pagerCommandsOf')) ?? [];
}

/** The scroll states ViewPager2 emits around a real finger turn.
 *
 *  Measured on device (2026-10-01): a swipe is
 *  `dragging, settling, selected, idle`, while a RELAYOUT -- a rotation, a
 *  multi-window resize -- emits a bare `selected` with the state never leaving
 *  idle, carrying an index one short under `layoutDirection="rtl"` (issue #107).
 *  The two are distinguishable only by this sequence, so a suite that wants a
 *  turn has to drive the whole of it; firing `onPageSelected` alone models the
 *  artifact, which is a different event with a different meaning.
 */
export function pagerTurn(
  result: { container: { querySelectorAll(selector: string): ArrayLike<object> } },
  position: number,
): void {
  const props = pagerPropsOf(result);
  props.onPageScrollStateChanged?.({ nativeEvent: { pageScrollState: 'dragging' } });
  props.onPageScrollStateChanged?.({ nativeEvent: { pageScrollState: 'settling' } });
  props.onPageSelected?.({ nativeEvent: { position } });
  props.onPageScrollStateChanged?.({ nativeEvent: { pageScrollState: 'idle' } });
}

/** A position report with no gesture behind it: what a rotation or a resize
 *  emits. See pagerTurn for why the distinction is the whole of issue #107. */
export function pagerRelayout(
  result: { container: { querySelectorAll(selector: string): ArrayLike<object> } },
  position: number,
): void {
  pagerPropsOf(result).onPageSelected?.({ nativeEvent: { position } });
}
