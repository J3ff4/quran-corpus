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
  headerLayout: null as ((height: number) => void) | null,
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
    default: { Text: AnimatedText, createAnimatedComponent: (Component: unknown) => Component },
    useSharedValue: (initial: number) => React.useRef({ value: initial }).current,
    useAnimatedStyle: (worklet: () => never) => {
      mocks.animatedStyles.push(worklet as unknown as () => Record<string, unknown>);
      return {};
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
    WordSheet: ({ summary, onClose, onOpenDetail, onOpenRoot }: {
      summary: { word: { id: number } } | null;
      onClose: () => void;
      onOpenDetail: (word: unknown) => void;
      onOpenRoot: (rootBuckwalter: string) => void;
    }) =>
      summary
        ? React.createElement(
            'div',
            { 'data-testid': 'word-sheet' },
            React.createElement('span', null, String(summary.word.id)),
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
    FlatList: ({ data, ListHeaderComponent, renderItem, onViewableItemsChanged, onScrollToIndexFailed, onScroll, onContentSizeChange, contentContainerStyle, importantForAccessibility, initialNumToRender, ref }: {
      data: unknown[];
      ListHeaderComponent?: React.ReactNode;
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      onViewableItemsChanged?: (info: { viewableItems: Array<{ item: unknown }> }) => void;
      onScrollToIndexFailed?: (info: { index: number; averageItemLength: number }) => void;
      onScroll?: (event: { nativeEvent: { contentOffset: { y: number } } }) => void;
      onContentSizeChange?: (width: number, height: number) => void;
      contentContainerStyle?: { paddingBottom?: number };
      importantForAccessibility?: string;
      initialNumToRender?: number;
      ref?: React.Ref<unknown>;
    }) => {
      mocks.onViewableItemsChanged = onViewableItemsChanged ?? null;
      mocks.onScrollToIndexFailed = onScrollToIndexFailed ?? null;
      mocks.onScroll = onScroll ?? null;
      mocks.onContentSizeChange = onContentSizeChange ?? null;
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
        },
        ListHeaderComponent,
        data.map((item, index) => React.createElement('div', { key: index }, renderItem({ item, index }))),
      );
    },
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    Pressable: host('button'),
    Text: host('span'),
    View: (props: { onLayout?: (event: { nativeEvent: { layout: { height: number } } }) => void }) => {
      // The list header is the only View in the reader that measures itself.
      if (props.onLayout) {
        const { onLayout } = props;
        mocks.headerLayout = (height: number) => onLayout({ nativeEvent: { layout: { height } } });
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
    mocks.animatedStyles = [];
    mocks.reduceMotion = false;
    mocks.getReaderPosition.mockReset().mockReturnValue(null);
    mocks.setReaderPosition.mockReset();
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

  it('renders far enough down the list for the deep-linked ayah to exist', () => {
    // Not a performance knob here: FlatList cannot scroll to a row it has
    // never rendered, and there is no getItemLayout to tell it where one
    // would be. Rendering the target is what makes the landing exact rather
    // than an estimate off the short cards near the top.
    render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);

    expect(screen.getByTestId('reader-list').getAttribute('data-initial-num-to-render')).toBe('255');
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

      // Two ticks: a scroll that missed nothing, over a content height the
      // previous scroll already ran against.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
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
        await vi.advanceTimersByTimeAsync(250);
      });
      expect(screen.queryByTestId('reader-positioning')).toBeNull();

      rerender(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={286} />);

      expect(screen.queryByTestId('reader-positioning')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-scrolls while the cards above the target are still growing', async () => {
    // The defect this covers: FlatList reports no failure as soon as the target
    // row is measured, but the offset it jumped to was summed over cards above
    // it that had not finished laying out. They grow, the target slides down,
    // and the reader is revealed two cards short of it (owner device, 6:87 from
    // a concordance row). A growing content height means the jump is stale.
    vi.useFakeTimers();
    try {
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      act(() => {
        mocks.onContentSizeChange?.(400, 90000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Still hidden, and scrolled again -- against the taller content.
      expect(screen.queryByTestId('reader-positioning')).not.toBeNull();
      const attemptsWhileGrowing = mocks.scrollToIndex.mock.calls.length;
      expect(attemptsWhileGrowing).toBeGreaterThanOrEqual(3);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Revealed on a tick that scrolled nothing: the last jump already ran
      // against the settled height, so the row it landed on is the row it stays
      // on.
      expect(screen.queryByTestId('reader-positioning')).toBeNull();
      expect(mocks.scrollToIndex).toHaveBeenCalledTimes(attemptsWhileGrowing);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the reader anyway once the retries are spent', async () => {
    vi.useFakeTimers();
    try {
      // Driven off the scroll, not fired independently: FlatList reports the
      // miss synchronously in response to scrollToIndex, so a row that never
      // measures fails every attempt rather than every other one.
      mocks.scrollToIndex.mockImplementation(() => {
        mocks.onScrollToIndexFailed?.({ index: 254, averageItemLength: 120 });
      });
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);

      // A row that never measures must settle: leaving the reader behind a
      // spinner for as long as the screen is open is worse than showing it in
      // the wrong place.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100 * 30);
      });

      expect(screen.queryByTestId('reader-positioning')).toBeNull();
      expect(mocks.scrollToIndex).toHaveBeenCalledTimes(25);
    } finally {
      // mockClear in beforeEach would leave the implementation behind for
      // every later test in the file.
      mocks.scrollToIndex.mockReset();
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
        await vi.advanceTimersByTimeAsync(250);
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
        await vi.advanceTimersByTimeAsync(250);
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

  it('renders mushaf mode without the translation the cards show', () => {
    // The switch in renderItem is the logic. Asserting on MushafAyah directly
    // would pass just as well with the reader hardcoded to AyahCard, which is
    // exactly the mistake this catches.
    const data = readerData(1);

    const { container, rerender } = render(<SurahReader {...baseProps(data)} readerMode="translation" />);
    const translation = data.ayahs[0]!.translation!.text;
    expect(container.textContent).toContain(translation);

    rerender(<SurahReader {...baseProps(data)} readerMode="mushaf" />);

    expect(container.textContent).not.toContain(translation);
    // The Arabic is still there -- mushaf mode drops the translation, not the
    // ayah.
    expect(container.textContent).toContain(data.ayahs[0]!.ayah.text_uthmani.slice(-8));
  });

  it('keeps the bookmark control reachable in either mode', () => {
    // Check 71 on the device list. Both renderers carry the same testID, so a
    // mode that quietly loses a control fails here rather than on the phone.
    const data = readerData(1);
    const ayahNumber = data.ayahs[0]!.ayah.ayah_number;

    const { rerender } = render(<SurahReader {...baseProps(data)} readerMode="translation" />);
    expect(screen.getByTestId(`ayah-1-${ayahNumber}-bookmark`)).toBeTruthy();

    rerender(<SurahReader {...baseProps(data)} readerMode="mushaf" />);
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
    const props = baseProps(readerData(10));
    const { rerender } = render(<SurahReader {...props} readerMode="translation" />);
    expect(mocks.scrollToIndex).not.toHaveBeenCalled();

    mocks.getReaderPosition.mockReturnValue(5);
    rerender(<SurahReader {...props} readerMode="mushaf" />);

    // The plate wrapping the list is MushafPlate in one mode and Fragment in
    // the other, so React unmounts the FlatList and the replacement starts at
    // offset 0. Without the re-anchor the reader lands on ayah 1.
    expect(mocks.scrollToIndex).toHaveBeenCalledWith({ index: 4, animated: false });
  });

  it('does not re-anchor when the store has nothing for this surah', () => {
    const props = baseProps(readerData(10));
    const { rerender } = render(<SurahReader {...props} readerMode="translation" />);

    rerender(<SurahReader {...props} readerMode="mushaf" />);

    expect(mocks.scrollToIndex).not.toHaveBeenCalled();
  });

  it('re-lands on every switch, though the target ayah never changes', () => {
    const props = baseProps(readerData(10));
    const { rerender } = render(<SurahReader {...props} readerMode="translation" />);

    mocks.getReaderPosition.mockReturnValue(5);
    rerender(<SurahReader {...props} readerMode="mushaf" />);
    expect(mocks.scrollToIndex).toHaveBeenCalledTimes(1);

    rerender(<SurahReader {...props} readerMode="translation" />);

    // The whole point of the nonce: index 4 both times, so an effect keyed only
    // on the index would not re-run and the second list would sit at offset 0.
    expect(mocks.scrollToIndex).toHaveBeenCalledTimes(2);
    expect(mocks.scrollToIndex).toHaveBeenLastCalledWith({ index: 4, animated: false });
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
        page: 1,
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
