import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferred } from '@/testing/deferred';
import { SurahReader } from './SurahReader';

const mocks = vi.hoisted(() => ({
  onViewableItemsChanged: null as ((info: { viewableItems: Array<{ item: unknown }> }) => void) | null,
  onScrollToIndexFailed: null as
    | ((info: { index: number; averageItemLength: number }) => void)
    | null,
  onScroll: null as ((event: { nativeEvent: { contentOffset: { y: number } } }) => void) | null,
  onContentSizeChange: null as ((width: number, height: number) => void) | null,
  getItemLayout: null as
    | ((data: unknown, index: number) => { length: number; offset: number; index: number })
    | null,
  headerLayout: null as ((height: number) => void) | null,
  /** The landing target's own onLayout. The list mock renders no real
   *  geometry, so this is how a test says where the row actually came out. */
  targetRowLayout: null as ((y: number) => void) | null,
  autoLayoutY: null as number | null,
  /** Hold the mode cross-fade's completion instead of running it, so a test
   *  can look at the reader mid-switch -- the only moment both renderings are
   *  mounted. Off by default. */
  holdFade: false,
  heldFades: [] as Array<(finished: boolean) => void>,
  scrollToIndex: vi.fn(),
  scrollToOffset: vi.fn(),
  focusEffect: null as (() => void) | null,
  getReaderPosition: vi.fn((_surahId: number) => null as number | null),
  setReaderPosition: vi.fn((_surahId: number, _ayahNumber: number) => {}),
  push: vi.fn(),
  setOptions: vi.fn(),
  // Every worklet registered this render, not just the last: usePressScale
  // registers one per animated Pressable (the header chip's segments, the
  // recitation bar), so "the last one wins" silently swapped the nav title's
  // worklet for a press scale.
  animatedStyles: [] as Array<() => Record<string, unknown>>,
  reduceMotion: false,
  /** Every set of props the mushaf half was rendered with, newest last. */
  mushafProps: [] as Array<Record<string, unknown>>,
  /** The arriving mushaf layer's onLanded, held rather than called. A real
   *  page lands when its font registers, which is not the same tick it mounts,
   *  and a mock that lands instantly would leave no window in which a switch
   *  is in flight -- the window every layering assertion here is about. */
  mushafLanded: null as (() => void) | null,
}));

// Mocked rather than rendered: MushafReader pulls expo-font, which throws on
// __DEV__ under jsdom, and it has its own suite. What this one asserts is the
// wiring -- which component each mode mounts, and the page it is opened at.
vi.mock('./mushaf/MushafReader', async () => {
  const React = await import('react');
  return {
    MushafReader: (props: Record<string, unknown>) => {
      mocks.mushafProps.push(props);
      mocks.mushafLanded = props['onLanded'] as () => void;
      return React.createElement('div', { 'data-testid': 'mushaf-reader' });
    },
  };
});

// The page index is a database read. Two pages of one surah and a third that
// opens the next one, which is what issue #58 is about.
vi.mock('@/mushaf/mushafReaderData', () => ({
  useMushafIndex: () => ({
    pages: new Map([
      [106, { page: 106, startSurahId: 1, startAyahNumber: 1, surahName: 'Al-Fatihah', juz: 6 }],
      [107, { page: 107, startSurahId: 1, startAyahNumber: 5, surahName: 'Al-Fatihah', juz: 6 }],
      [108, { page: 108, startSurahId: 2, startAyahNumber: 1, surahName: 'Al-Baqarah', juz: 6 }],
    ]),
    surahNames: new Map([[1, 'Al-Fatihah'], [2, 'Al-Baqarah']]),
    ready: true,
  }),
}));

// Not importOriginal: the real package doesn't parse under vitest (Metro-only
// syntax), and SurahReader only ever touches these two exports.
// The recitation bar builds a pan gesture for its scrub track. Nothing here
// drives it -- this is only so the real package, which does not parse under
// vitest, stays out of the graph.
vi.mock('react-native-gesture-handler', async () => (await import('@/testing/rnHosts.js')).reactNativeGestureHandlerMock());

vi.mock('@/settings/settingsStore', () => ({
  // Not a provider: the real store pulls expo-sqlite into the jsdom module
  // graph, and every other component test here mocks it the same way. The
  // step only has to be one useArabicSizes recognises.
  useAppSettings: () => ({ arabicScale: 'medium', reduceMotion: mocks.reduceMotion }),
}));

// The nav title's animated style is the one worklet in this screen. Captured
// rather than rendered: shared-value writes deliberately do not re-render, so
// there is no committed output to read the opacity off -- the worklet has to be
// called with whatever the scroll handler last wrote.
vi.mock('react-native-reanimated', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  const AnimatedText = host('span');

  return {
    // createAnimatedComponent joined Text here when the reader took over its
    // own header: ReaderHeader renders SegmentedControl, whose segments are
    // animated Pressables.
    // View joined Text and createAnimatedComponent when the reader's control
    // row gained its note reveal: AyahControls is an Animated.View carrying a
    // layout animation, and a missing one renders as undefined.
    default: {
      Text: AnimatedText,
      View: host('div'),
      createAnimatedComponent: (Component: unknown) => Component,
    },
    // Inert builders and an inert sequence, for that same reveal. Which
    // builder each case picks is asserted in motion/bookmarkReveal.test.ts;
    // this screen only has to render.
    ...Object.fromEntries(
      ['ZoomIn', 'ZoomOut', 'LinearTransition'].map((name) => {
        const builder: unknown = new Proxy({ name }, { get: (target, key) => (key === 'name' ? target.name : () => builder) });
        return [name, builder];
      }),
    ),
    Easing: { out: (fn: unknown) => fn, ease: undefined },
    // The completion callback is run, not dropped. The mode cross-fade drops
    // the outgoing layer from that callback, so a mock that ignores it leaves
    // both renderings mounted for ever -- and every assertion about "which
    // mode is on screen" would then be reading two of them.
    withTiming: (toValue: number, _config?: unknown, callback?: (finished: boolean) => void) => {
      if (!callback) return toValue;
      if (mocks.holdFade) mocks.heldFades.push(callback);
      else callback(true);
      return toValue;
    },
    runOnJS: (fn: unknown) => fn,
    withSequence: (...steps: number[]) => steps[steps.length - 1],
    useSharedValue: (initial: number) => React.useRef({ value: initial }).current,
    // Evaluated, not stubbed to {}. The shared values these worklets read are
    // real objects here (useSharedValue below returns one), and withTiming
    // assigns its target value synchronously, so the result is the opacity the
    // layer would actually wear. That is the only way a test can tell a
    // cross-fade from two layers printed over each other.
    useAnimatedStyle: (worklet: () => never) => {
      mocks.animatedStyles.push(worklet as unknown as () => Record<string, unknown>);
      return (worklet as unknown as () => Record<string, unknown>)();
    },
    // Linear between two stops with both ends clamped, which is all this
    // screen asks of the real one.
    interpolate: (value: number, input: number[], output: number[]) => {
      const [inputStart, inputEnd] = input as [number, number];
      const [outputStart, outputEnd] = output as [number, number];
      if (value <= inputStart) return outputStart;
      if (value >= inputEnd) return outputEnd;
      const ratio = (value - inputStart) / (inputEnd - inputStart);
      return outputStart + ratio * (outputEnd - outputStart);
    },
    Extrapolation: { CLAMP: 'clamp' },
  };
});

vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return {
    useNavigation: () => ({ setOptions: mocks.setOptions }),
    router: { push: mocks.push },
    // Run on mount AND captured for later. The real hook fires on mount too,
    // and a double that only captured hid the case the reader has to ignore --
    // a mount finding a stale position in the module singleton. Calling the
    // captured one afterwards is then a genuine RE-focus, which is what coming
    // back from the word-by-word screen is.
    useFocusEffect: (callback: () => void) => {
      mocks.focusEffect = callback;
      useEffect(() => {
        callback();
      }, [callback]);
    },
  };
});

// Mocked rather than exercised through the real singleton: these assertions are
// about what the reader does with a position, and the store has its own suite.
vi.mock('@/data/readerPosition', () => ({
  getReaderPosition: (surahId: number) => mocks.getReaderPosition(surahId),
  setReaderPosition: (surahId: number, ayahNumber: number) => mocks.setReaderPosition(surahId, ayahNumber),
}));

// The sheet has its own suite; stubbed here so this one covers the wiring --
// which summary opens, and which route each action pushes -- without pulling
// reanimated and gesture-handler into it.
vi.mock('./LanguageSheet', async () => {
  const React = await import('react');
  return {
    LanguageSheet: ({ onChange, onClose }: {
      onChange: (code: string) => void;
      onClose: () => void;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'language-sheet' },
        React.createElement('button', { 'data-testid': 'pick-ru', onClick: () => onChange('ru') }),
        React.createElement('button', { 'data-testid': 'close-language', onClick: onClose }),
      ),
  };
});

vi.mock('./ReciterSheet', async () => {
  const React = await import('react');
  return {
    ReciterSheet: ({ current, onSelect, onClose }: {
      current: string;
      onSelect: (id: string) => void;
      onClose: () => void;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'reciter-sheet', 'data-current': current },
        React.createElement('button', { 'data-testid': 'pick-sudais', onClick: () => onSelect('sudais') }),
        React.createElement('button', { 'data-testid': 'close-reciters', onClick: onClose }),
      ),
  };
});

vi.mock('./WordSheet', async () => {
  const React = await import('react');
  return {
    // ayahActions and ayahLabel are rendered, not dropped: a mock that
    // destructures only what it knew about passes every assertion about a prop
    // it silently throws away (the lesson rnHosts taught twice).
    WordSheet: ({ summary, onClose, onOpenDetail, onOpenRoot, ayahActions, ayahLabel }: {
      summary: { word: { id: number } } | null;
      onClose: () => void;
      onOpenDetail: (word: unknown) => void;
      onOpenRoot: (rootBuckwalter: string) => void;
      ayahActions?: React.ReactNode;
      ayahLabel?: string;
    }) =>
      summary
        ? React.createElement(
            'div',
            { 'data-testid': 'word-sheet' },
            React.createElement('span', null, String(summary.word.id)),
            ayahLabel ? React.createElement('span', { 'data-testid': 'sheet-ayah-label' }, ayahLabel) : null,
            ayahActions,
            React.createElement('button', { 'data-testid': 'close-sheet', onClick: onClose }),
            React.createElement('button', {
              'data-testid': 'open-detail',
              onClick: () => onOpenDetail(summary.word),
            }),
            React.createElement('button', {
              'data-testid': 'open-root',
              onClick: () => onOpenRoot("r$m"),
            }),
          )
        : null,
  };
});

vi.mock('react-native', async () => {
  const React = await import('react');
  const { host } = await import('@/testing/rnHosts.js');
  // Hoisted: host('div') built inside the render would be a new component
  // type every pass, remounting the whole subtree on each render.
  const Div = host('div');
  return {
    // Forwards the ref, so the imperative scroll calls the component makes on
    // mount are observable. A plain function component silently swallows it
    // and every scroll assertion would pass against a null ref.
    FlatList: ({ data, ListHeaderComponent, renderItem, CellRendererComponent, onViewableItemsChanged, onScrollToIndexFailed, onScroll, onContentSizeChange, getItemLayout, contentContainerStyle, importantForAccessibility, initialNumToRender, style, ref }: {
      data: unknown[];
      ListHeaderComponent?: React.ReactNode;
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      CellRendererComponent?: React.ComponentType<{ index: number; children?: React.ReactNode }>;
      onViewableItemsChanged?: (info: { viewableItems: Array<{ item: unknown }> }) => void;
      onScrollToIndexFailed?: (info: { index: number; averageItemLength: number }) => void;
      onScroll?: (event: { nativeEvent: { contentOffset: { y: number } } }) => void;
      onContentSizeChange?: (width: number, height: number) => void;
      getItemLayout?: (data: unknown, index: number) => { length: number; offset: number; index: number };
      contentContainerStyle?: { paddingBottom?: number };
      importantForAccessibility?: string;
      initialNumToRender?: number;
      style?: { opacity?: number };
      ref?: React.Ref<unknown>;
    }) => {
      mocks.onViewableItemsChanged = onViewableItemsChanged ?? null;
      mocks.onScrollToIndexFailed = onScrollToIndexFailed ?? null;
      mocks.onScroll = onScroll ?? null;
      mocks.onContentSizeChange = onContentSizeChange ?? null;
      mocks.getItemLayout = getItemLayout ?? null;
      React.useImperativeHandle(ref, () => ({
        scrollToIndex: mocks.scrollToIndex,
        scrollToOffset: mocks.scrollToOffset,
      }));
      return React.createElement(
        'div',
        // Surfaced as an attribute: it is the only thing keeping the reader
        // out of TalkBack's swipe order while the sheet is up, and RN's own
        // prop has no DOM equivalent to assert against.
        {
          'data-testid': 'reader-list',
          'data-important-for-accessibility': importantForAccessibility,
          'data-initial-num-to-render': String(initialNumToRender),
          // The docked bar floats over the list, so this is the only thing
          // keeping the last ayah out from behind it.
          'data-padding-bottom': String(contentContainerStyle?.paddingBottom),
          // The reader hides a list that has not landed by setting its
          // opacity, and a mounted-but-invisible list is indistinguishable
          // from a visible one through its rows alone.
          'data-opacity': String(style?.opacity),
        },
        ListHeaderComponent,
        // Through the cell renderer when there is one, exactly as
        // VirtualizedList does. The landing measures the *cell*, so a mock that
        // renders rows bare leaves the target row unwired and every landing
        // test asserts against a scroll sequence that never got a measurement.
        data.map((item, index) =>
          CellRendererComponent
            ? React.createElement(
                CellRendererComponent,
                { key: index, index },
                renderItem({ item, index }),
              )
            : React.createElement('div', { key: index }, renderItem({ item, index })),
        ),
      );
    },
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    Pressable: host('button'),
    Text: host('span'),
    View: (props: {
      testID?: string;
      onLayout?: (event: { nativeEvent: { layout: { height: number; y: number } } }) => void;
    }) => {
      // Two Views in the reader measure themselves, and they want different
      // halves of the layout: the list header its height, the landing target
      // its y. Routed by testID rather than by "the first one wins", which is
      // what this was before the target row existed.
      if (props.onLayout) {
        const { onLayout } = props;
        if (props.testID === 'reader-target-row') {
          mocks.targetRowLayout = (y: number) => onLayout({ nativeEvent: { layout: { height: 0, y } } });
          // A row inside the initial render window lays out on the first
          // paint, before the landing effect runs -- which is the ordering a
          // shallow target has on device and the one a manual call after
          // render cannot produce.
          if (mocks.autoLayoutY !== null) {
            onLayout({ nativeEvent: { layout: { height: 0, y: mocks.autoLayoutY } } });
          }
        } else {
          mocks.headerLayout = (height: number) =>
            onLayout({ nativeEvent: { layout: { height, y: 0 } } });
        }
      }
      return React.createElement(Div, props);
    },
    useWindowDimensions: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
    // The docked recitation bar's layer stretches over the reader.
    StyleSheet: (await import('@/testing/rnHosts.js')).StyleSheet,
    // useReducedMotion reads the OS flag. Off here, so the in-app setting is
    // the only thing these tests vary.
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: () => ({ remove: () => {} }),
    },
  };
});

describe('SurahReader', () => {
  beforeEach(() => {
    mocks.scrollToIndex.mockClear();
    mocks.scrollToOffset.mockClear();
    mocks.push.mockClear();
    mocks.setOptions.mockClear();
    mocks.onScroll = null;
    mocks.headerLayout = null;
    mocks.targetRowLayout = null;
    mocks.autoLayoutY = null;
    mocks.animatedStyles = [];
    mocks.holdFade = false;
    mocks.heldFades = [];
    mocks.reduceMotion = false;
    mocks.getReaderPosition.mockReset().mockReturnValue(null);
    mocks.setReaderPosition.mockReset();
    mocks.mushafProps = [];
    mocks.mushafLanded = null;
  });

  afterEach(cleanup);

  it('uses the latest reading callback after rerender', () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    // The same literal baseProps builds, and it had already drifted from it.
    const props = baseProps(readerData());

    const { rerender } = render(<SurahReader {...props} onReadingAyah={firstHandler} />);
    rerender(<SurahReader {...props} onReadingAyah={secondHandler} />);

    mocks.onViewableItemsChanged?.({ viewableItems: [{ item: props.data.ayahs[0] }] });

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledWith(1);
  });

  it('opens at the saved ayah and stays put when it is the first one', () => {
    render(<SurahReader {...baseProps(readerData(10))} initialAyahNumber={4} />);

    expect(mocks.scrollToIndex).toHaveBeenCalledWith({ index: 3, animated: false });

    cleanup();
    mocks.scrollToIndex.mockClear();

    // Index 0 and an ayah that is not in this surah both mean "no scroll" --
    // scrolling to the top of a list already at the top only flickers.
    render(<SurahReader {...baseProps(readerData(10))} initialAyahNumber={1} />);
    render(<SurahReader {...baseProps(readerData(10))} initialAyahNumber={999} />);

    expect(mocks.scrollToIndex).not.toHaveBeenCalled();
  });

  it('gives FlatList a getItemLayout so it can jump without measuring', () => {
    const props = baseProps(readerData(10));
    render(<SurahReader {...props} />);

    const getItemLayout = mocks.getItemLayout;
    expect(getItemLayout).toBeInstanceOf(Function);

    const first = getItemLayout!(props.data.ayahs, 0);
    const second = getItemLayout!(props.data.ayahs, 1);
    expect(first.offset).toBe(0);
    expect(first.length).toBeGreaterThan(0);
    // Offsets are cumulative: an index's offset is every earlier row summed.
    // FlatList sums nothing itself -- this table is the whole scroll geometry.
    expect(second.offset).toBe(first.length);
  });

  it('counts the list header in every offset it hands FlatList', () => {
    // VirtualizedList reads a cell it has already laid out at its real y --
    // measured in the content container, so counting the header -- and reads
    // every other cell off this table. The two have to be the same coordinate
    // space or the model jump lands a whole SurahPlate short.
    const props = baseProps(readerData(10));
    render(<SurahReader {...props} />);

    const before = mocks.getItemLayout!(props.data.ayahs, 2).offset;
    act(() => {
      mocks.headerLayout!(356);
    });
    const after = mocks.getItemLayout!(props.data.ayahs, 2).offset;

    expect(after).toBe(before + 356);
    // Index 0 too: the first ayah sits below the header like every other one.
    expect(mocks.getItemLayout!(props.data.ayahs, 0).offset).toBe(356);
  });

  it('stops widening initialNumToRender to cover a deep target', () => {
    // The old landing needed the target rendered on the first commit to be
    // measurable. getItemLayout removes that, and with it the cost of laying
    // out every row above a deep link (282 of them for 2:282).
    render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);

    expect(screen.getByTestId('reader-list').getAttribute('data-initial-num-to-render')).toBe('10');
  });

  it('opens a surah with no deep link on the default window', () => {
    // Mounting 286 cards is worth it to land on 2:255; paying it to open at
    // 2:1 is not.
    render(<SurahReader {...baseProps(readerData(300))} />);

    expect(screen.getByTestId('reader-list').getAttribute('data-initial-num-to-render')).toBe('10');
  });

  it('retries the scroll without moving the list when the row is not measured yet', async () => {
    vi.useFakeTimers();
    try {
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);
      mocks.scrollToIndex.mockClear();

      act(() => {
        mocks.onScrollToIndexFailed?.({ index: 254, averageItemLength: 120 });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });

      expect(mocks.scrollToIndex).toHaveBeenCalledWith({ index: 254, animated: false });
      // The estimate is what landed the reader on the wrong ayah, and every
      // jump it made fired a reading-position write.
      expect(mocks.scrollToOffset).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the reader hidden until the deep-link scroll lands', async () => {
    vi.useFakeTimers();
    try {
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);
      expect(screen.queryByTestId('reader-positioning')).not.toBeNull();

      // Past the deadline -- 8100 tracks LANDING_DEADLINE_MS, which is 8s so
      // that it clears a cold start's first layout (t=3697ms measured on the
      // owner's device) rather than cutting the landing short at 2s. Nothing
      // measures here, so the pass cap never applies -- it counts corrections,
      // and there is nothing to correct against. The deadline is the only
      // thing that ends a landing whose target never reports.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8100);
      });

      expect(screen.queryByTestId('reader-positioning')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides the reader again when a second deep link arrives on the same surah', async () => {
    // An `ayah` param change on a reader that is already mounted re-runs the
    // landing without remounting. Left revealed, the second jump is seen as
    // motion and every ayah it passes over is written to the saved reading
    // position -- the pair of defects the landing loop exists to prevent.
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8100);
      });
      expect(screen.queryByTestId('reader-positioning')).toBeNull();

      rerender(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={286} />);

      expect(screen.queryByTestId('reader-positioning')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a measurement the target row reported before the landing began', async () => {
    // A row inside the initial render window lays out on the first paint, in
    // the same commit that runs the landing effect. Clearing the stored offset
    // there threw that measurement away, and no second layout followed: the
    // landing had nothing to correct against and ran out the deadline on the
    // raw model offset. Searching 2:5 from a reader already open on 2:282 put
    // 2:4 at the top on the owner's device (2026-09-07: 80 attempts, 8033ms,
    // not one measurement).
    vi.useFakeTimers();
    try {
      mocks.autoLayoutY = 1845;
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={5} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(mocks.scrollToOffset).toHaveBeenCalledWith({ offset: 1845, animated: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores a measurement left by the target it has landed away from', async () => {
    // The stamp is the whole reason the offset can be carried: a different
    // target's y is not this one's, and correcting to it would land the reader
    // wherever the last deep link went.
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />,
      );
      act(() => {
        mocks.targetRowLayout?.(40000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      mocks.scrollToOffset.mockClear();

      rerender(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={5} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(mocks.scrollToOffset).not.toHaveBeenCalled();
      expect(screen.queryByTestId('reader-positioning')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reveals a row that keeps re-laying out faster than the retry tick', async () => {
    // Every measurement restarts the 100ms timer, so a row that reports more
    // often than that pushes attempt() -- and with it the deadline check --
    // permanently out of reach. Without a second check here the reader waits
    // behind its spinner for as long as the row keeps moving.
    vi.useFakeTimers();
    try {
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);

      for (let tick = 0; tick < 200; tick += 1) {
        act(() => {
          mocks.targetRowLayout?.(40000 + tick);
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(50);
        });
      }

      expect(screen.queryByTestId('reader-positioning')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a measurement whose row has been unmounted since', async () => {
    // The stamp says which row the number is about, not whether it is still
    // true. Once the target's cell is recycled, the rows above it swap model
    // estimates for measured heights and its old y stops pointing at it --
    // so coming back to the same ayah must re-measure, not trust the number.
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />,
      );
      act(() => {
        mocks.targetRowLayout?.(40000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      // Landing elsewhere takes 255's cell down with it, and nothing measures
      // the new target, so any offset still in hand is 255's.
      rerender(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={5} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });
      mocks.scrollToOffset.mockClear();

      rerender(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(mocks.scrollToOffset).not.toHaveBeenCalled();
      expect(mocks.scrollToIndex).toHaveBeenCalledWith({ index: 254, animated: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('corrects the model jump against the target row real offset', async () => {
    // getItemLayout's offsets are a model, and the model is not exact: worst
    // measured drift is 512dp deep in Al-Baqara. So the jump is an
    // approach, and the row's own laid-out y is what the landing corrects to.
    vi.useFakeTimers();
    try {
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);

      // The model put the row somewhere; it actually laid out at 40000.
      act(() => {
        mocks.targetRowLayout?.(40000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mocks.scrollToOffset).toHaveBeenCalledWith({ offset: 40000, animated: false });
      // Still hidden: one correction is not evidence the row stopped moving.
      expect(screen.queryByTestId('reader-positioning')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reveals the list only once the target row stops moving', async () => {
    // A correction can move the rows above the target -- they lay out as they
    // enter the window -- which moves the target again. The landing is the
    // pass where it does not.
    vi.useFakeTimers();
    try {
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);

      act(() => {
        mocks.targetRowLayout?.(40000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(screen.queryByTestId('reader-positioning')).not.toBeNull();

      // Unchanged under the correction: settled.
      act(() => {
        mocks.targetRowLayout?.(40000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.queryByTestId('reader-positioning')).toBeNull();
      expect(mocks.scrollToOffset).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up after the cap rather than hiding the reader forever', async () => {
    vi.useFakeTimers();
    try {
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);

      // A row that never settles: a different y every pass. Showing the reader
      // in the wrong place is bad; leaving it behind a spinner for as long as
      // the screen is open is worse.
      for (let pass = 0; pass < 10; pass += 1) {
        act(() => {
          mocks.targetRowLayout?.(40000 + pass * 40);
        });
        // Sequential on purpose: firing the passes together collapses them
        // into one settle, which is the opposite of what this asserts.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(100);
        });
      }

      expect(screen.queryByTestId('reader-positioning')).toBeNull();
      // The model jump, then the three corrections the cap allows. The jump
      // itself is not a pass: spending the budget on it is what stopped the
      // settle test from ever running on the device.
      expect(mocks.scrollToIndex).toHaveBeenCalledTimes(1);
      expect(mocks.scrollToOffset).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not record a reading position before the deep-link scroll lands', async () => {
    // The rows visible mid-landing are wherever the list happens to be, not
    // where the reader is. Recording them overwrites the saved position with
    // an ayah nobody read -- and that row is on the user's device, so a bad
    // write is not fixed by shipping a new build.
    vi.useFakeTimers();
    try {
      const onReadingAyah = vi.fn();
      const data = readerData(300);
      render(
        <SurahReader {...baseProps(data)} initialAyahNumber={255} onReadingAyah={onReadingAyah} />,
      );

      act(() => {
        mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
      });
      expect(onReadingAyah).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(8100);
      });
      act(() => {
        mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[254] }] });
      });

      expect(onReadingAyah).toHaveBeenCalledWith(255);
    } finally {
      vi.useRealTimers();
    }
  });

  it('records the ayah the deep-link landing settled on', async () => {
    // Nothing else records it. onViewableItemsChanged is muted for the whole
    // jump (see the test above), and no scroll follows the reveal to fire one
    // afterwards -- so without this write the shared position still holds the
    // previous reading of this surah, and the first mode switch re-anchors
    // there. On the device, opening /surah/2?ayah=50 and tapping Translation
    // landed on 2:1.
    vi.useFakeTimers();
    try {
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);
      // Not before the landing: mid-jump the list is wherever it happens to be.
      expect(mocks.setReaderPosition).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(8100);
      });

      expect(mocks.setReaderPosition).toHaveBeenCalledWith(1, 255);
    } finally {
      vi.useRealTimers();
    }
  });

  it('fetches words for ayahs that scroll into view, plus a lookahead', async () => {
    const loadWords = vi.fn(async (ayahId: number) => surahWords(ayahId));
    render(<SurahReader {...baseProps(readerData(10))} loadWords={loadWords} />);

    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: readerData(10).ayahs[0] }] });
    });

    expect(loadWords).toHaveBeenCalledWith(100);
    // The ayah in view plus WORD_LOOKAHEAD: a reader who taps a word the
    // instant an ayah lands otherwise waits on a query.
    expect(loadWords).toHaveBeenCalledTimes(4);
  });

  it('does not refetch an ayah it already has', async () => {
    // onViewableItemsChanged fires on every scroll frame that changes the set.
    // Without the cache check this is a query per frame.
    const loadWords = vi.fn(async (ayahId: number) => surahWords(ayahId));
    const data = readerData(10);
    render(<SurahReader {...baseProps(data)} loadWords={loadWords} />);

    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
    });
    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
    });

    expect(loadWords).toHaveBeenCalledTimes(4);
  });

  it('retries an ayah whose words failed to load', async () => {
    // Marked as requested before the await, so without clearing it on failure
    // the ayah stays untappable for as long as the screen is open.
    const loadWords = vi.fn(async () => {
      throw new Error('db is locked');
    });
    const data = readerData(1);
    render(<SurahReader {...baseProps(data)} loadWords={loadWords} />);

    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
    });
    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
    });

    expect(loadWords).toHaveBeenCalledTimes(2);
  });

  it('takes the reader out of the accessibility tree while the sheet is open', async () => {
    // accessibilityViewIsModal is iOS-only, so without this the ayah text and
    // both card buttons stay reachable by TalkBack swipe underneath a sheet
    // that visually covers them.
    const data = readerData(1);
    const { container } = render(
      <SurahReader
        {...baseProps(data)}
        loadWords={async (ayahId) => surahWords(ayahId)}
        loadWordSummary={(async (word: { id: number }) => ({ word, segments: [], gloss: null })) as never}
      />,
    );
    const list = () => container.querySelector('[data-important-for-accessibility]');

    expect(list()?.getAttribute('data-important-for-accessibility')).toBe('auto');

    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
    });
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('word-token')[0]!);
    });

    expect(screen.getByTestId('word-sheet')).toBeTruthy();
    expect(list()?.getAttribute('data-important-for-accessibility')).toBe('no-hide-descendants');
  });

  it('takes the reader out of the accessibility tree while the language sheet alone is open', () => {
    // The prop used to be keyed on openWord only, so with just the LANGUAGE
    // sheet open the ayah list stayed 'auto' -- TalkBack could swipe past the
    // sheet straight into the reader underneath it.
    const { container } = render(<SurahReader {...baseProps(readerData(3))} />);
    const list = () => container.querySelector('[data-important-for-accessibility]');

    renderReaderHeader();

    expect(list()?.getAttribute('data-important-for-accessibility')).toBe('auto');

    fireEvent.click(screen.getByTestId('open-language'));

    expect(list()?.getAttribute('data-important-for-accessibility')).toBe('no-hide-descendants');
  });

  it('opens the sheet for the word that was pressed', async () => {
    const data = readerData(1);
    const loadWordSummary = vi.fn(async (word: { id: number }) => ({
      word,
      segments: [],
      gloss: null,
    }));
    render(
      <SurahReader
        {...baseProps(data)}
        loadWords={async (ayahId) => surahWords(ayahId)}
        loadWordSummary={loadWordSummary as never}
      />,
    );

    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
    });
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('word-token')[1]!);
    });

    // The second token, not the first: a sheet that always shows word 1 is
    // exactly what passing the token list instead of the pressed word gives.
    expect(loadWordSummary).toHaveBeenCalledWith(expect.objectContaining({ position: 2 }));
    expect(screen.getByTestId('word-sheet').textContent).toContain('1002');
  });

  it('carries the ayah-s own controls into the word sheet', async () => {
    // Ruling 4: the mushaf page has no chrome, so this row is the only way to
    // bookmark, note or play the ayah being read as print. The sheet is where
    // it lives in both modes -- the tap that opens it is the same tap.
    const data = readerData(1);
    const onToggleBookmark = vi.fn();
    render(
      <SurahReader
        {...baseProps(data)}
        onToggleBookmark={onToggleBookmark}
        loadWords={async (ayahId) => surahWords(ayahId)}
        loadWordSummary={(async (word: { id: number }) => ({ word, segments: [], gloss: null })) as never}
      />,
    );

    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
    });
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('word-token')[0]!);
    });

    expect(screen.getByTestId('sheet-ayah-label').textContent).toBe('Ayah 1');
    // Scoped to the sheet: the ayah card carries a bookmark with the same
    // handle, and a document-wide query would pass on the card's alone.
    const sheet = screen.getByTestId('word-sheet');
    const bookmark = sheet.querySelector('[data-testid="ayah-1-1-bookmark"]');
    expect(bookmark).toBeTruthy();
    fireEvent.click(bookmark!);
    expect(onToggleBookmark).toHaveBeenCalledWith(1);
  });

  it('shows no ayah controls for a word from a surah the reader is not on', async () => {
    // A mushaf page carries ayahs from surahs the route never named -- page
    // 106 opens in An-Nisa and heads Al-Ma-idah. Every control here is keyed
    // to the displayed surah, so acting on one of those words would bookmark
    // the wrong ayah. Morphology, no actions.
    const data = readerData(1);
    render(
      <SurahReader
        {...baseProps(data)}
        loadWords={async () => surahWords(999)}
        loadWordSummary={(async (word: { id: number }) => ({ word, segments: [], gloss: null })) as never}
      />,
    );

    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
    });
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('word-token')[0]!);
    });

    expect(screen.getByTestId('word-sheet')).toBeTruthy();
    expect(screen.queryByTestId('sheet-ayah-label')).toBeNull();
  });

  it('shows the word tapped last, not the query that finished last', async () => {
    // The first tap of a surah is the slow one -- it warms the gloss cache --
    // so a second tap really can resolve first. Without the sequence guard the
    // sheet then shows word 1 while the user tapped word 2, and nothing on
    // screen says the two disagree.
    const data = readerData(1);
    const first = deferred<{ word: { id: number } }>();
    const second = deferred<{ word: { id: number } }>();
    const pending = [first.promise, second.promise];
    const loadWordSummary = vi.fn(() => pending.shift()!);

    render(
      <SurahReader
        {...baseProps(data)}
        loadWords={async (ayahId) => surahWords(ayahId)}
        loadWordSummary={loadWordSummary as never}
      />,
    );

    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
    });
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('word-token')[0]!);
      fireEvent.click(screen.getAllByTestId('word-token')[1]!);
    });

    await act(async () => {
      second.resolve({ word: { id: 1002 } });
    });
    await act(async () => {
      first.resolve({ word: { id: 1001 } });
    });

    expect(screen.getByTestId('word-sheet').textContent).toContain('1002');
  });

  it('does not re-open the sheet with a tap that resolves after dismissal', async () => {
    // Tap, then dismiss before the query lands. Closing has to invalidate the
    // in-flight request, or the sheet the user just swiped away comes back by
    // itself.
    const data = readerData(1);
    const open = deferred<{ word: { id: number } }>();
    const late = deferred<{ word: { id: number } }>();
    const pending = [open.promise, late.promise];

    render(
      <SurahReader
        {...baseProps(data)}
        loadWords={async (ayahId) => surahWords(ayahId)}
        loadWordSummary={(() => pending.shift()!) as never}
      />,
    );

    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
    });

    // First tap resolves, so there is a sheet on screen to dismiss.
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('word-token')[0]!);
    });
    await act(async () => {
      open.resolve({ word: { id: 1001 } });
    });
    expect(screen.getByTestId('word-sheet')).toBeTruthy();

    // Second tap stays in flight across the dismissal.
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('word-token')[1]!);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('close-sheet'));
    });
    expect(screen.queryByTestId('word-sheet')).toBeNull();

    await act(async () => {
      late.resolve({ word: { id: 1002 } });
    });

    expect(screen.queryByTestId('word-sheet')).toBeNull();
  });

  it('pushes the word route by ayah number, not ayah id', async () => {
    const data = readerData(3);
    render(
      <SurahReader
        {...baseProps(data)}
        loadWords={async (ayahId) => surahWords(ayahId)}
        loadWordSummary={(async (word: { id: number }) => ({ word, segments: [], gloss: null })) as never}
      />,
    );

    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[1] }] });
    });
    await act(async () => {
      // Ayah 1 was never in view, so it has no words and no tokens: the first
      // token on screen is ayah 2's first word.
      fireEvent.click(screen.getAllByTestId('word-token')[0]!);
    });
    fireEvent.click(screen.getByTestId('open-detail'));

    // /word/[surah]/[ayah]/[position] takes the ayah's number in the surah.
    // The word row carries ayah_id, which is a database key -- pushing it
    // routes to a different ayah entirely, or to none.
    expect(mocks.push).toHaveBeenCalledWith('/word/1/2/1');
  });

  it('percent-encodes the buckwalter root in the route it pushes', async () => {
    const data = readerData(1);
    render(
      <SurahReader
        {...baseProps(data)}
        loadWords={async (ayahId) => surahWords(ayahId)}
        loadWordSummary={(async (word: { id: number }) => ({ word, segments: [], gloss: null })) as never}
      />,
    );

    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
    });
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('word-token')[0]!);
    });
    fireEvent.click(screen.getByTestId('open-root'));

    // Buckwalter uses $ < > ' and & as letters; raw, they either break the
    // path or arrive at the root screen as different characters.
    expect(mocks.push).toHaveBeenCalledWith('/root/r%24m');
  });

  it('offers word-by-word from the navigation header', async () => {
    // Surah 2, not the fixture's default 1: with the id equal to the literal
    // in the route this passes just as well when the control is hardcoded.
    const base = readerData(1);
    const data = { ...base, surah: { ...base.surah, id: 2 } };
    render(<SurahReader {...baseProps(data)} />);

    await waitFor(() => expect(mocks.setOptions).toHaveBeenCalled());
    renderReaderHeader();
    fireEvent.click(screen.getByTestId('segment-wbw'));

    // The surah on screen, not a hardcoded one: setOptions is re-run whenever
    // data.surah.id changes. Nothing has been read yet, so the range starts at
    // the top of the surah.
    expect(mocks.push).toHaveBeenCalledWith('/surah/2/words?from=1');
  });
  it('opens word-by-word at the ayah on screen', async () => {
    const props = baseProps(readerData(10));
    mocks.getReaderPosition.mockReturnValue(6);
    render(<SurahReader {...props} />);

    await waitFor(() => expect(mocks.setOptions).toHaveBeenCalled());
    renderReaderHeader();
    fireEvent.click(screen.getByTestId('segment-wbw'));

    // The ayah on screen, not the route param: the param is where the reader
    // was opened, which after any scrolling is not where the reader is.
    expect(mocks.push).toHaveBeenCalledWith('/surah/1/words?from=6');
  });

  it('docks the recitation bar on the ayah that played, and keeps it after it stops', () => {
    // The bar outliving playingAyah is the point: it goes null the moment the
    // recitation ends, and a bar that vanished with the last syllable would
    // take the resume control with it.
    const data = readerData(3);
    const ayahNumber = data.ayahs[1]!.ayah.ayah_number;

    const { rerender } = render(<SurahReader {...baseProps(data)} audioEnabled playingAyah={null} />);
    expect(screen.queryByTestId('recitation-bar')).toBeNull();

    rerender(<SurahReader {...baseProps(data)} audioEnabled playingAyah={ayahNumber} />);
    expect(screen.getByTestId('recitation-bar').getAttribute('aria-label')).toContain(String(ayahNumber));

    rerender(<SurahReader {...baseProps(data)} audioEnabled playingAyah={null} />);
    expect(screen.getByTestId('recitation-bar').getAttribute('aria-label')).toContain(String(ayahNumber));
  });

  it('reserves room under the last ayah for the docked bar', () => {
    // The bar is two rows tall and absolutely positioned over the list, so
    // without this the last ayah of every surah reads from behind it.
    const data = readerData(3);
    const { rerender } = render(<SurahReader {...baseProps(data)} audioEnabled playingAyah={null} />);
    const withoutBar = Number(screen.getByTestId('reader-list').getAttribute('data-padding-bottom'));

    rerender(
      <SurahReader {...baseProps(data)} audioEnabled playingAyah={data.ayahs[0]!.ayah.ayah_number} />,
    );

    expect(
      Number(screen.getByTestId('reader-list').getAttribute('data-padding-bottom')),
    ).toBeGreaterThan(withoutBar);
  });

  it('opens the reciter picker from the bar and reports the pick', () => {
    // The bar renders the reciter's name, not its id, and the picker it opens
    // hands the choice back to the screen above rather than storing it here.
    const data = readerData(3);
    const onChangeReciter = vi.fn();
    const props = baseProps(data);
    render(
      <SurahReader
        {...props}
        audioEnabled
        playingAyah={data.ayahs[0]!.ayah.ayah_number}
        recitation={{ ...props.recitation, reciterId: 'husary', onChangeReciter }}
      />,
    );

    expect(screen.getByTestId('recitation-reciter').textContent).toContain('Al-Husary');
    fireEvent.click(screen.getByTestId('recitation-reciter'));
    expect(screen.getByTestId('reciter-sheet').getAttribute('data-current')).toBe('husary');
    // Same reason the word and language sheets do it: accessibilityViewIsModal
    // is iOS-only, so on Android a TalkBack swipe walks out of the picker onto
    // the ayah list and the bar underneath it.
    expect(screen.getByTestId('reader-list').getAttribute('data-important-for-accessibility')).toBe(
      'no-hide-descendants',
    );
    expect(
      screen.getByTestId('recitation-bar').parentElement?.getAttribute('data-hidden-from-a11y'),
    ).toBe('true');

    fireEvent.click(screen.getByTestId('pick-sudais'));

    expect(onChangeReciter).toHaveBeenCalledWith('sudais');
  });

  it('hides the docked bar from a screen reader while a sheet covers it', async () => {
    // accessibilityViewIsModal is iOS-only, so on Android a TalkBack swipe
    // walks out of the sheet onto whatever is behind it -- the same defect the
    // ayah list carries importantForAccessibility for.
    const data = readerData(1);
    const { container } = render(
      <SurahReader
        {...baseProps(data)}
        audioEnabled
        playingAyah={data.ayahs[0]!.ayah.ayah_number}
        loadWords={async (ayahId) => surahWords(ayahId)}
        loadWordSummary={(async (word: { id: number }) => ({ word, segments: [], gloss: null })) as never}
      />,
    );
    const barLayer = () => screen.getByTestId('recitation-bar').parentElement;
    expect(barLayer()?.getAttribute('data-hidden-from-a11y')).toBeNull();

    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
    });
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('word-token')[0]!);
    });

    expect(container.querySelector('[data-testid="word-sheet"]')).toBeTruthy();
    expect(barLayer()?.getAttribute('data-hidden-from-a11y')).toBe('true');
  });

  it('renders the pager in mushaf mode, not a list of ayah rows', () => {
    // Ruling 6: the paged mushaf replaces the scroll mushaf outright. A reader
    // that still listed ayahs in mushaf mode would look almost right -- the
    // Arabic is the same text -- so this asserts on which component mounted.
    const data = readerData(8);

    const { rerender } = render(<SurahReader {...baseProps(data)} readerMode="translation" />);
    expect(screen.queryByTestId('mushaf-reader')).toBeNull();
    expect(screen.getAllByTestId('reader-list')).toHaveLength(1);

    rerender(<SurahReader {...baseProps(data)} readerMode="mushaf" />);
    act(() => mocks.mushafLanded?.());
    rerender(<SurahReader {...baseProps(data)} readerMode="mushaf" />);

    expect(screen.getByTestId('mushaf-reader')).toBeTruthy();
    expect(screen.queryAllByTestId('reader-list')).toHaveLength(0);
  });

  it('still renders translation mode as a list of cards', () => {
    // The guard on ruling 6: paged replaces the mushaf, not the reader.
    const data = readerData(3);

    render(<SurahReader {...baseProps(data)} readerMode="translation" />);

    expect(screen.getByTestId('reader-list')).toBeTruthy();
    // getAllByText: the fixture gives every ayah the same translation.
    expect(screen.getAllByText(data.ayahs[0]!.translation!.text)).toHaveLength(3);
    expect(screen.queryByTestId('mushaf-reader')).toBeNull();
  });

  it('hides the translation on every card when the setting is off', () => {
    // The setting is the screen's, the cards are the list's, and the reader is
    // the only thing between them -- a wiring test, because AyahCard's own
    // suite passes whether or not anything hands it the flag.
    const data = readerData(3);
    const translation = data.ayahs[0]!.translation!.text;

    const { container, rerender } = render(
      <SurahReader {...baseProps(data)} readerMode="translation" showTranslation />,
    );
    expect(container.textContent).toContain(translation);

    rerender(<SurahReader {...baseProps(data)} readerMode="translation" showTranslation={false} />);

    expect(container.textContent).not.toContain(translation);
    expect(container.textContent).toContain(data.ayahs[0]!.ayah.text_uthmani);
  });

  it('opens on the page holding the requested ayah', () => {
    // /surah/1?ayah=5 has to open the page 1:5 is printed on, not the surah's
    // first page: a page is not a surah (ruling 10), and the ayah column is
    // the only thing that knows which page it is.
    const data = readerData(8);

    render(<SurahReader {...baseProps(data)} readerMode="mushaf" initialAyahNumber={5} />);

    expect(mocks.mushafProps.at(-1)?.['initialPage']).toBe(107);
    expect(mocks.mushafProps.at(-1)?.['landingAyah']).toEqual({ surahId: 1, ayahNumber: 5 });
  });

  it('opens on the surah-s own first page when no ayah was asked for', () => {
    // Page 1 of the mushaf would be al-Fatihah -- a plausible-looking wrong
    // book for every surah but the first.
    const data = readerData(8);

    render(<SurahReader {...baseProps(data)} readerMode="mushaf" />);

    expect(mocks.mushafProps.at(-1)?.['initialPage']).toBe(106);
  });

  it('keeps the surah name after a page turn crosses into the next surah', () => {
    // Issue #58: the name went blank after a chevron turn and stayed blank.
    // In a pager the name is a function of the page, and the screen's
    // mount-time surah is exactly what it must not be.
    const data = readerData(8);
    render(<SurahReader {...baseProps(data)} readerMode="mushaf" />);
    const nameOf = () => {
      const options = mocks.setOptions.mock.calls.at(-1)?.[0] as {
        header: () => React.ReactElement<{ surahName: string }>;
      };
      return options.header().props.surahName;
    };
    expect(nameOf()).toBe('Al-Fatihah');

    const onPageChange = mocks.mushafProps.at(-1)?.['onPageChange'] as (page: number) => void;
    act(() => onPageChange(108));

    expect(nameOf()).toBe('Al-Baqarah');
  });

  it('reports a page turn with the surah and ayah that page opens on', () => {
    // Ruling 15. The pair is the page-s own, not the screen-s: page 108 opens
    // al-Baqarah while the reader was opened on al-Fatihah, and pairing the
    // new page with the old surah stores a coordinate nobody read.
    const onReadingPage = vi.fn();
    render(
      <SurahReader {...baseProps(readerData(8))} readerMode="mushaf" onReadingPage={onReadingPage} />,
    );

    const onPageChange = mocks.mushafProps.at(-1)?.['onPageChange'] as (page: number) => void;
    act(() => onPageChange(108));

    expect(onReadingPage).toHaveBeenCalledWith({ surahId: 2, ayahNumber: 1, page: 108 });
  });

  it('follows the recitation onto the page the ayah being played is printed on', () => {
    // Ruling 19. Without this the audio tint moves onto a page the reader is
    // not looking at.
    const data = readerData(8);
    const { rerender } = render(
      <SurahReader {...baseProps(data)} readerMode="mushaf" playingAyah={null} />,
    );
    expect(mocks.mushafProps.at(-1)?.['focusPage']).toBeNull();

    rerender(<SurahReader {...baseProps(data)} readerMode="mushaf" playingAyah={5} />);

    expect(mocks.mushafProps.at(-1)?.['focusPage']).toBe(107);
  });

  it('never blanks the reader while a mode switch lands', async () => {
    // The defect: switching modes changed the element type wrapping the list,
    // React unmounted it, and the replacement re-ran the landing behind a
    // spinner on an empty screen -- up to 2.5s deep in a long surah (owner
    // report, 2026-09-01). The incoming rendering now lands underneath the one
    // already on screen, so there is nothing to blank.
    mocks.holdFade = true;
    vi.useFakeTimers();
    try {
      const data = readerData(300);
      const translation = data.ayahs[254]!.translation!.text;
      const { container, rerender } = render(
        <SurahReader {...baseProps(data)} readerMode="translation" initialAyahNumber={255} />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8100);
      });
      expect(container.textContent).toContain(translation);

      rerender(<SurahReader {...baseProps(data)} readerMode="mushaf" initialAyahNumber={255} />);

      // Mid-landing, which is the whole window the defect lived in: the
      // arriving rendering has mounted and has not settled, and there is still
      // no spinner and no blank.
      expect(screen.queryByTestId('reader-positioning')).toBeNull();
      expect(container.textContent).toContain(translation);
      expect(screen.getByTestId('mushaf-reader')).toBeTruthy();
      expect(screen.getByTestId('reader-layer-1').style.opacity).toBe('0');

      // The mushaf lands when its first page's font is registered, which is
      // not the tick it mounted -- exactly the window a blank would show in.
      await act(async () => {
        mocks.mushafLanded?.();
        await vi.advanceTimersByTimeAsync(8100);
      });

      // Still nothing, once it has landed and before the fade is released.
      expect(screen.queryByTestId('reader-positioning')).toBeNull();
      expect(container.textContent).toContain(translation);

      // A no-op re-render first: a shared value assignment does not re-render
      // on its own, so the layers still carry the styles computed before the
      // fade started. This is the next paint, which is what the phone shows.
      rerender(<SurahReader {...baseProps(data)} readerMode="mushaf" initialAyahNumber={255} />);

      // And the outgoing rendering is already invisible, before the drop that
      // removes it. A layer's background is the bloom showing through, so an
      // arriving layer at full opacity does not cover the one beneath: without
      // its own fade the outgoing layer stays legible under the new one until
      // the drop runs, which on device was 420ms of two readings of 2:255
      // printed over each other.
      expect(screen.getByTestId('reader-layer-0').style.opacity).toBe('0');
      expect(screen.getByTestId('reader-layer-1').style.opacity).toBe('1');

      // The fade lands, and only then does the outgoing rendering go.
      await act(async () => {
        while (mocks.heldFades.length > 0) mocks.heldFades.shift()?.(true);
      });
      expect(container.textContent).not.toContain(translation);

      // And dropping the spent layer must not blank the survivor. It moves
      // from index 1 to index 0 as the array shrinks; while index 0 rendered
      // its list bare and every other index wrapped it, that move changed the
      // element type at that position, so React unmounted the landed list and
      // rebuilt it -- which re-ran the landing behind the spinner on an empty
      // screen. That was the blank the device still showed after the fade
      // (Al-Baqara 2:255, 2026-09-01).
      expect(screen.queryByTestId('reader-positioning')).toBeNull();
      expect(screen.getByTestId('mushaf-reader')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lands a reduced-motion switch through the fade, not around it', async () => {
    // Reduced motion still gets a cut -- but the cut has to be committed
    // before the spent layer goes. Writing the shared value directly and
    // dropping in the same tick re-rendered the survivor with no animated
    // style, which unregistered the view before the write landed, and the
    // node kept the opacity reanimated had last applied: 0. Header over an
    // empty page, reduced motion only (device, 2026-09-03).
    mocks.reduceMotion = true;
    mocks.holdFade = true;
    vi.useFakeTimers();
    try {
      const data = readerData(300);
      const translation = data.ayahs[254]!.translation!.text;
      const { container, rerender } = render(
        <SurahReader {...baseProps(data)} readerMode="translation" initialAyahNumber={255} />,
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8100);
      });

      rerender(<SurahReader {...baseProps(data)} readerMode="mushaf" initialAyahNumber={255} />);
      await act(async () => {
        mocks.mushafLanded?.();
        await vi.advanceTimersByTimeAsync(8100);
      });

      // The landing is done and the spent layer is still here, because the
      // drop is the fade's completion callback. Dropping it from the reveal
      // itself is what the direct write did.
      expect(mocks.heldFades.length).toBeGreaterThan(0);
      expect(screen.queryByTestId('reader-layer-0')).not.toBeNull();
      expect(container.textContent).toContain(translation);

      await act(async () => {
        while (mocks.heldFades.length > 0) mocks.heldFades.shift()?.(true);
      });

      expect(screen.queryByTestId('reader-layer-0')).toBeNull();
      expect(screen.queryByTestId('reader-positioning')).toBeNull();
      expect(screen.getByTestId('mushaf-reader')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the bookmark control on the cards translation mode draws', () => {
    // Check 71 on the device list. It no longer has a mushaf half: a printed
    // page carries no controls (ruling 4), and the ayah actions moved into the
    // word sheet with M7c.
    const data = readerData(1);
    const ayahNumber = data.ayahs[0]!.ayah.ayah_number;

    render(<SurahReader {...baseProps(data)} readerMode="translation" />);

    expect(screen.getByTestId(`ayah-1-${ayahNumber}-bookmark`)).toBeTruthy();
  });

  it('opens the surah with the basmala above ayah 1, not inside its card', () => {
    // The device defect this replaced: the banner lived inside AyahCard, under
    // the ayah number and bookmark row, and still read as ayah 1's own first
    // line (owner report, 2026-08-17).
    const data = withAyah1(96, 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ٱقْرَأْ');

    const { container } = render(<SurahReader {...baseProps(data)} />);

    const banner = screen.getByTestId('bismillah');
    const card = screen.getByText('In the name of Allah').closest('div');
    expect(card).toBeTruthy();
    expect(card!.contains(banner)).toBe(false);
    // No words are loaded here, which is every surah's first paint. The run
    // still has to give the prefix up, or the basmala shows twice.
    expect(container.textContent?.match(/ٱلرَّحِيمِ/gu)).toHaveLength(1);
    expect(container.textContent).toContain('ٱقْرَأْ');
  });

  it.each([
    [1, 'al-Fatiha, whose ayah 1 IS the basmala'],
    [9, 'at-Tawba, which has none'],
  ])('opens surah %i with no banner (%s)', (surahId) => {
    const data = withAyah1(surahId, 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ ٱقْرَأْ');

    const { container } = render(<SurahReader {...baseProps(data)} />);

    expect(screen.queryByTestId('bismillah')).toBeNull();
    // And the ayah keeps every word it was given: on these two the prefix is
    // not a prefix, so stripping it deletes real text.
    expect(container.textContent).toContain('ٱلرَّحِيمِ');
  });

  it('puts both reader actions in the nav header, not above the ayahs', () => {
    render(<SurahReader {...baseProps(readerData(3))} />);

    // Two calls or one with both children -- what matters is that the header
    // ends up carrying a word-by-word control AND a language control. The
    // language pills used to sit in a fixed band above the list, costing a
    // strip of every screenful (owner ruling 2026-08-17).
    expect(readerHeaderFactory()).toBeTypeOf('function');

    renderReaderHeader();
    expect(screen.getByTestId('segment-wbw')).toBeTruthy();
    expect(screen.getByTestId('open-language')).toBeTruthy();
  });

  it('opens the language sheet from the header and routes the pick out', () => {
    const onChangeContentLanguage = vi.fn();
    render(
      <SurahReader
        {...baseProps(readerData(3))}
        onChangeContentLanguage={onChangeContentLanguage}
      />,
    );

    renderReaderHeader();

    // Closed until asked for: an always-mounted sheet leaves a full-screen
    // backdrop swallowing every tap in the reader.
    expect(screen.queryByTestId('language-sheet')).toBeNull();

    fireEvent.click(screen.getByTestId('open-language'));
    fireEvent.click(screen.getByTestId('pick-ru'));

    expect(onChangeContentLanguage).toHaveBeenCalledWith('ru');
  });

  it('closes an open word sheet before opening the language sheet from the header', async () => {
    // The header lives in expo-router's native toolbar, above WordSheet's
    // absoluteFill backdrop, not inside it -- so without this the globe stays
    // tappable while a word sheet is up, and the two backdrops stack instead
    // of one replacing the other.
    const data = readerData(1);
    render(
      <SurahReader
        {...baseProps(data)}
        loadWords={async (ayahId) => surahWords(ayahId)}
        loadWordSummary={(async (word: { id: number }) => ({ word, segments: [], gloss: null })) as never}
      />,
    );

    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
    });
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('word-token')[0]!);
    });
    expect(screen.getByTestId('word-sheet')).toBeTruthy();

    renderReaderHeader();
    fireEvent.click(screen.getByTestId('open-language'));

    expect(screen.queryByTestId('word-sheet')).toBeNull();
    expect(screen.getByTestId('language-sheet')).toBeTruthy();
  });

  it('closes an open word sheet before navigating to the word-by-word grid', async () => {
    // The words button shares the globe's problem: it sits in the native
    // toolbar, outside the backdrop. Navigating with the sheet still mounted
    // means coming back lands on a stale sheet that is also still holding the
    // ayah list at no-hide-descendants.
    const data = readerData(1);
    render(
      <SurahReader
        {...baseProps(data)}
        loadWords={async (ayahId) => surahWords(ayahId)}
        loadWordSummary={(async (word: { id: number }) => ({ word, segments: [], gloss: null })) as never}
      />,
    );

    await act(async () => {
      mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
    });
    await act(async () => {
      fireEvent.click(screen.getAllByTestId('word-token')[0]!);
    });
    expect(screen.getByTestId('word-sheet')).toBeTruthy();

    renderReaderHeader();
    fireEvent.click(screen.getByTestId('segment-wbw'));

    expect(screen.queryByTestId('word-sheet')).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith('/surah/1/words?from=1');
  });

  /** The animated style the nav title would be wearing right now. */
  function titleStyle() {
    // The one worklet that produces an opacity: the press-scale worklets
    // produce a transform alone.
    const style = mocks.animatedStyles
      .map((worklet) => worklet())
      .find((candidate) => 'opacity' in candidate) as
      | { opacity: number; transform: [{ translateY: number }] }
      | undefined;
    if (!style) throw new Error('the reader never registered an animated title style');
    return { opacity: style.opacity, translateY: style.transform[0].translateY };
  }

  /** The reader's own header bar, which replaced the native toolbar in M6d.
   *
   *  The last call carrying its own key, not the last call overall: the nav
   *  title's effect fires separately and does not set `header`. */
  function readerHeaderFactory() {
    return mocks.setOptions.mock.calls
      .map(([options]) => options.header)
      .filter((factory) => factory !== undefined)
      .at(-1) as (() => React.ReactElement) | undefined;
  }

  function renderReaderHeader() {
    const header = readerHeaderFactory();
    if (!header) throw new Error('the reader never set a header');
    return render(<div>{header()}</div>);
  }

  /** Scrolls to `y` with a header of `height` behind it. */
  function scrollTo(height: number, ...offsets: number[]) {
    act(() => {
      mocks.headerLayout?.(height);
      for (const y of offsets) mocks.onScroll?.({ nativeEvent: { contentOffset: { y } } });
    });
  }

  it('puts the surah name in the header as an element, not a title string', () => {
    // A title string is rendered into the native toolbar, outside this screen's
    // view tree, and nothing there can be animated.
    render(<SurahReader {...baseProps(readerData(30))} />);
    const { getByTestId } = renderReaderHeader();

    expect(getByTestId('reader-title').textContent).toBe('Al-Baqarah');
  });

  it('keeps the nav title hidden while the big heading is on screen', () => {
    // Duplicating the 24pt heading in the app bar on the first screenful is
    // exactly the doubled-up look CLAUDE.md §8 rules out.
    render(<SurahReader {...baseProps(readerData(30))} />);
    scrollTo(180, 0);

    expect(titleStyle().opacity).toBe(0);
  });

  it('fades the title in part-way as the heading leaves, not all at once', () => {
    // The check that rules out a boolean swap: half way through the ramp the
    // name is half there. Switched at a threshold it would already be whole,
    // which is the "appears out of nowhere" the owner reported.
    render(<SurahReader {...baseProps(readerData(30))} />);
    scrollTo(180, 180 - 4 - 20);

    const { opacity, translateY } = titleStyle();

    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    expect(translateY).toBeGreaterThan(0);
  });

  it('has the title fully arrived once the heading is gone', () => {
    render(<SurahReader {...baseProps(readerData(30))} />);
    scrollTo(180, 200);

    expect(titleStyle()).toEqual({ opacity: 1, translateY: 0 });
  });

  it('fades it back out on the way up', () => {
    render(<SurahReader {...baseProps(readerData(30))} />);
    scrollTo(180, 200, 10);

    expect(titleStyle().opacity).toBe(0);
  });

  it('measures the threshold rather than assuming one', () => {
    // The header grows with the Arabic size setting and the OS font scale, so
    // a constant threshold starts the fade at the wrong scroll position on any
    // device that is not the one it was tuned on.
    render(<SurahReader {...baseProps(readerData(30))} />);
    scrollTo(600, 200);

    expect(titleStyle().opacity).toBe(0);
  });

  it('holds the title back until the header has measured', () => {
    render(<SurahReader {...baseProps(readerData(30))} />);

    act(() => {
      mocks.onScroll?.({ nativeEvent: { contentOffset: { y: 200 } } });
    });

    // No onLayout yet: with no measured threshold, a naive `y > height` would
    // read 200 > 0 and fade the title in at the very top of the surah.
    expect(titleStyle().opacity).toBe(0);
  });

  it('steps the title in without a ramp under reduce animations', () => {
    // A fade is still motion. The setting is a standing instruction not to
    // animate, so the name is either there or it is not.
    mocks.reduceMotion = true;
    render(<SurahReader {...baseProps(readerData(30))} />);
    scrollTo(180, 180 - 4 - 20);

    expect(titleStyle()).toEqual({ opacity: 0, translateY: 0 });

    scrollTo(180, 200);

    expect(titleStyle()).toEqual({ opacity: 1, translateY: 0 });
  });
});

/** readerData for one surah whose ayah 1 carries the given Uthmani text. */
function withAyah1(surahId: number, textUthmani: string) {
  const data = readerData();
  return {
    ...data,
    surah: { ...data.surah, id: surahId },
    ayahs: data.ayahs.map((item, index) =>
      index === 0 ? { ...item, ayah: { ...item.ayah, text_uthmani: textUthmani } } : item,
    ),
  };
}


describe('SurahReader shared reading position', () => {
  // Its own hooks: this is a sibling describe, so the suite's outer beforeEach
  // does not reach it, and a scroll from the previous test leaks into the next
  // assertion.
  beforeEach(() => {
    mocks.scrollToIndex.mockClear();
    mocks.getReaderPosition.mockReset().mockReturnValue(null);
    mocks.setReaderPosition.mockReset();
    mocks.mushafProps = [];
    mocks.mushafLanded = null;
  });

  afterEach(cleanup);

  it('records the first visible ayah as the shared position', () => {
    const props = baseProps(readerData(10));
    render(<SurahReader {...props} />);

    mocks.onViewableItemsChanged?.({ viewableItems: [{ item: props.data.ayahs[3] }] });

    // Surah 1 in this fixture; ayah 4 is the fourth row.
    expect(mocks.setReaderPosition).toHaveBeenCalledWith(1, 4);
  });

  it('does not record an ayah the landing scroll is merely passing over', () => {
    const props = baseProps(readerData(10));
    render(<SurahReader {...props} initialAyahNumber={8} />);

    mocks.onViewableItemsChanged?.({ viewableItems: [{ item: props.data.ayahs[2] }] });

    // The rows visible mid-landing are wherever the list happens to be. The
    // saved reading position is gated on exactly this, and a shared position
    // written from an un-landed list would then re-land the reader on it.
    expect(mocks.setReaderPosition).not.toHaveBeenCalled();
  });

  it('lands on the shared position when the reader mode changes', () => {
    // Mushaf -> translation, which since M7c is the direction that mounts a
    // list: the arriving list starts at offset 0, and without the re-anchor
    // the reader lands on ayah 1 rather than where the mushaf was left.
    const props = baseProps(readerData(10));
    const { rerender } = render(<SurahReader {...props} readerMode="mushaf" />);
    expect(mocks.scrollToIndex).not.toHaveBeenCalled();

    mocks.getReaderPosition.mockReturnValue(5);
    rerender(<SurahReader {...props} readerMode="translation" />);

    expect(mocks.scrollToIndex).toHaveBeenCalledWith({ index: 4, animated: false });
  });

  it('does not re-anchor when the store has nothing for this surah', () => {
    const props = baseProps(readerData(10));
    const { rerender } = render(<SurahReader {...props} readerMode="mushaf" />);

    rerender(<SurahReader {...props} readerMode="translation" />);

    expect(mocks.scrollToIndex).not.toHaveBeenCalled();
  });

  it('re-lands on every switch, though the target ayah never changes', async () => {
    vi.useFakeTimers();
    try {
      const props = baseProps(readerData(10));
      const { rerender } = render(<SurahReader {...props} readerMode="mushaf" />);

      mocks.getReaderPosition.mockReturnValue(5);
      rerender(<SurahReader {...props} readerMode="translation" />);
      expect(mocks.scrollToIndex).toHaveBeenCalledTimes(1);

      // The first switch has to finish before the second is a switch at all:
      // one asked for while the arrival is still in flight cancels it rather
      // than stacking a third rendering (see below).
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8100);
      });
      const landed = mocks.scrollToIndex.mock.calls.length;
      rerender(<SurahReader {...props} readerMode="mushaf" />);
      act(() => mocks.mushafLanded?.());
      rerender(<SurahReader {...props} readerMode="translation" />);

      // The whole point of the nonce: index 4 both times, so an effect keyed
      // only on the index would not re-run and the second list would sit at
      // offset 0. A count rather than an exact number -- a landing retries
      // until the list reports content, and how many attempts that takes is
      // not what this asserts.
      expect(mocks.scrollToIndex.mock.calls.length).toBeGreaterThan(landed);
      expect(mocks.scrollToIndex).toHaveBeenLastCalledWith({ index: 4, animated: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels an arrival rather than stacking a third rendering on it', () => {
    const props = baseProps(readerData(10));
    const { rerender } = render(<SurahReader {...props} readerMode="translation" />);
    expect(screen.getAllByTestId(/^reader-layer-/)).toHaveLength(1);
    // A position to land on, so every arrival below stays mid-landing: one
    // that has nothing to scroll to reveals and is dropped in the same tick,
    // and there would be no in-flight switch to interrupt.
    mocks.getReaderPosition.mockReturnValue(5);

    // Mid-landing: the arrival has mounted and has not been revealed.
    rerender(<SurahReader {...props} readerMode="mushaf" />);
    expect(screen.getAllByTestId(/^reader-layer-/)).toHaveLength(2);

    // Back to the rendering still on screen underneath. The arrival was at
    // opacity 0 for its whole life, so dropping it shows nothing -- where
    // appending would have mounted a third full list of the surah.
    rerender(<SurahReader {...props} readerMode="translation" />);
    expect(screen.getAllByTestId(/^reader-layer-/)).toHaveLength(1);
    expect(screen.getByTestId('reader-layer-0')).toBeTruthy();

    // And a switch back mid-flight is still two, not three: the arrival is
    // replaced rather than stacked on. There is no third mode to reach for --
    // ReaderMode is 'mushaf' | 'translation', and the 'words' this line used
    // to pass was not one of them (issue #54).
    rerender(<SurahReader {...props} readerMode="mushaf" />);
    expect(screen.getAllByTestId(/^reader-layer-/)).toHaveLength(2);
  });

  it('keeps touch and TalkBack on the rendering that is actually on screen', () => {
    const props = baseProps(readerData(10));
    const { rerender } = render(<SurahReader {...props} readerMode="mushaf" />);
    mocks.getReaderPosition.mockReturnValue(5);
    rerender(<SurahReader {...props} readerMode="translation" />);

    // The arrival is at opacity 0 for the length of the landing -- up to 2.5s
    // deep in a long surah. Handing it touches means a tap lands on a list
    // nobody can see, scrolled somewhere else, and bookmarks the wrong ayah.
    expect(screen.getByTestId('reader-layer-0').getAttribute('data-pointer-events')).toBe('auto');
    expect(screen.getByTestId('reader-layer-1').getAttribute('data-pointer-events')).toBe('none');

    // The arriving list is the only one here, and it is the one that must stay
    // out of TalkBack's swipe order until it is what the reader is looking at.
    const list = screen.getByTestId('reader-list');
    expect(list.getAttribute('data-important-for-accessibility')).toBe('no-hide-descendants');
  });

  it('re-lands on the ayah the word-by-word screen was left at', () => {
    const props = baseProps(readerData(10));
    render(<SurahReader {...props} />);
    mocks.onViewableItemsChanged?.({ viewableItems: [{ item: props.data.ayahs[3] }] });
    mocks.scrollToIndex.mockClear();

    // The reader stays mounted behind the pushed screen, so coming back is a
    // focus event and nothing else -- no remount, no changed prop.
    mocks.getReaderPosition.mockReturnValue(7);
    act(() => mocks.focusEffect?.());

    expect(mocks.scrollToIndex).toHaveBeenCalledWith({ index: 6, animated: false });
  });

  it('honours the ayah it was opened with over a stale shared position', () => {
    // The store is a module singleton that outlives the screen: reading 2:200,
    // backing out and then tapping a bookmark for 2:5 finds 200 still in it.
    // The mount's focus must not act on that -- the anchor has already been
    // seeded from the route, and the route is what the reader asked for.
    mocks.getReaderPosition.mockReturnValue(200);
    render(<SurahReader {...baseProps(readerData(250))} initialAyahNumber={5} />);

    expect(mocks.scrollToIndex).toHaveBeenCalledWith({ index: 4, animated: false });
    expect(mocks.scrollToIndex).not.toHaveBeenCalledWith({ index: 199, animated: false });
  });

  it('does not re-land when the position is the ayah already on screen', () => {
    const props = baseProps(readerData(10));
    render(<SurahReader {...props} />);
    mocks.onViewableItemsChanged?.({ viewableItems: [{ item: props.data.ayahs[3] }] });
    mocks.scrollToIndex.mockClear();

    mocks.getReaderPosition.mockReturnValue(4);
    act(() => mocks.focusEffect?.());

    // Otherwise every return to the reader jerks the list back to the top of
    // the ayah it is already showing.
    expect(mocks.scrollToIndex).not.toHaveBeenCalled();
  });

  it('lands once per mount, not twice', () => {
    render(<SurahReader {...baseProps(readerData(10))} initialAyahNumber={5} />);

    // Resolving the anchor in an effect set state after the landing effect had
    // already run against the seed, so every mount began a second sequence on
    // top of the first.
    expect(mocks.scrollToIndex).toHaveBeenCalledTimes(1);
  });
});

function baseProps(data: ReturnType<typeof readerData>) {
  return {
    data,
    bookmarkedAyahs: new Set<number>(),
    playingAyah: null,
    audioEnabled: false,
    recitation: {
      positionSec: 0,
      durationSec: Number.NaN,
      continuous: false,
      reciterId: 'husary',
      onChangeReciter: vi.fn(),
      onSkipNext: vi.fn(),
      onSkipPrevious: vi.fn(),
      onSeek: vi.fn(),
      onToggleContinuous: vi.fn(),
    },
    uiLocale: 'en' as const,
    onToggleBookmark: vi.fn(),
    onToggleAudio: vi.fn(),
    contentLanguage: 'en' as const,
    onChangeContentLanguage: vi.fn(),
    readerMode: 'translation' as const,
    onChangeReaderMode: vi.fn(),
  };
}

function surahWords(ayahId: number) {
  return ['بسم', 'الله'].map((textArabic, index) => ({
    id: ayahId * 10 + index + 1,
    ayah_id: ayahId,
    position: index + 1,
    text_arabic: textArabic,
    transliteration: null,
    root: null,
    lemma: null,
    root_buckwalter: null,
    lemma_buckwalter: null,
    pos_tag: 'N',
    morphology_json: null,
    morphology_description: null,
    grammar_arabic: null,
    grammar_note: null,
    audio_url: null,
  }));
}

function readerData(ayahCount = 1) {
  // 30 stands in for the header-scroll tests' "long surah" -- everything else
  // in this file uses a count with no bearing on which surah it is, so this
  // is the one branch allowed to diverge from al-Fatihah's own facts below.
  const surah =
    ayahCount === 30
      ? {
          id: 2,
          name_arabic: 'البقرة',
          name_translit: 'Al-Baqarah',
          name_translation: 'The Cow',
          revelation_type: 'medinan' as const,
          ayah_count: 286,
          order_number: 87,
        }
      : {
          id: 1,
          name_arabic: 'الفاتحة',
          name_translit: 'Al-Fatihah',
          name_translation: 'The Opener',
          revelation_type: 'meccan' as const,
          ayah_count: 7,
          order_number: 5,
        };
  return {
    surah,
    ayahs: Array.from({ length: ayahCount }, (_unused, index) => ({
      ayah: {
        // Offset from ayah_number on purpose: with the two equal, every test
        // below passes just as well when the code uses the wrong one.
        id: 100 + index,
        surah_id: surah.id,
        ayah_number: index + 1,
        text_uthmani: 'بسم الله',
        text_simple: 'بسم الله',
        juz: 1,
        // Four ayahs to a page, so a test can ask for an ayah that is NOT on
        // the surah's first page. With every ayah on page 1 the mushaf would
        // open at the right page whether or not it read this column.
        page: 106 + Math.floor(index / 4),
        audio_url: null,
      },
      translation: {
        id: index + 1,
        ayah_id: 100 + index,
        language_code: 'en',
        language: 'en',
        translator: 'Saheeh International',
        text: 'In the name of Allah',
      },
    })),
  };
}
