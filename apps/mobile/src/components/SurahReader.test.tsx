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
  headerLayout: null as ((height: number) => void) | null,
  scrollToIndex: vi.fn(),
  scrollToOffset: vi.fn(),
  push: vi.fn(),
  setOptions: vi.fn(),
}));

// Not importOriginal: the real package doesn't parse under vitest (Metro-only
// syntax), and SurahReader only ever touches these two exports.
vi.mock('@/settings/settingsStore', () => ({
  // Not a provider: the real store pulls expo-sqlite into the jsdom module
  // graph, and every other component test here mocks it the same way. The
  // step only has to be one useArabicSizes recognises.
  useAppSettings: () => ({ arabicScale: 'medium' }),
}));

vi.mock('expo-router', () => ({
  useNavigation: () => ({ setOptions: mocks.setOptions }),
  router: { push: mocks.push },
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
    FlatList: ({ data, ListHeaderComponent, renderItem, onViewableItemsChanged, onScrollToIndexFailed, onScroll, importantForAccessibility, ref }: {
      data: unknown[];
      ListHeaderComponent?: React.ReactNode;
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      onViewableItemsChanged?: (info: { viewableItems: Array<{ item: unknown }> }) => void;
      onScrollToIndexFailed?: (info: { index: number; averageItemLength: number }) => void;
      onScroll?: (event: { nativeEvent: { contentOffset: { y: number } } }) => void;
      importantForAccessibility?: string;
      ref?: React.Ref<unknown>;
    }) => {
      mocks.onViewableItemsChanged = onViewableItemsChanged ?? null;
      mocks.onScrollToIndexFailed = onScrollToIndexFailed ?? null;
      mocks.onScroll = onScroll ?? null;
      React.useImperativeHandle(ref, () => ({
        scrollToIndex: mocks.scrollToIndex,
        scrollToOffset: mocks.scrollToOffset,
      }));
      return React.createElement(
        'div',
        // Surfaced as an attribute: it is the only thing keeping the reader
        // out of TalkBack's swipe order while the sheet is up, and RN's own
        // prop has no DOM equivalent to assert against.
        { 'data-important-for-accessibility': importantForAccessibility },
        ListHeaderComponent,
        data.map((item, index) => React.createElement('div', { key: index }, renderItem({ item, index }))),
      );
    },
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
  });

  afterEach(cleanup);

  it('uses the latest reading callback after rerender', () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const props = {
      data: readerData(),
      bookmarkedAyahs: new Set<number>(),
      playingAyah: null,
      audioEnabled: false,
      uiLocale: 'en' as const,
      onToggleBookmark: vi.fn(),
      onToggleAudio: vi.fn(),
      contentLanguage: 'en' as const,
      onChangeContentLanguage: vi.fn(),
    };

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

  it('recovers from an unmeasured row by estimating the offset, then gives up', async () => {
    vi.useFakeTimers();
    try {
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);
      mocks.scrollToIndex.mockClear();

      // FlatList reports this for any row it has not laid out yet, which is
      // every row past initialNumToRender on a list of variable-height cards.
      for (let attempt = 0; attempt < 8; attempt += 1) {
        act(() => {
          mocks.onScrollToIndexFailed?.({ index: 254, averageItemLength: 120 });
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(200);
        });
      }

      expect(mocks.scrollToOffset).toHaveBeenCalledWith({ offset: 254 * 120, animated: false });
      // Capped: a row that never measures must settle instead of retrying for
      // as long as the screen is open.
      expect(mocks.scrollToIndex).toHaveBeenCalledTimes(5);
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
    // The last call carrying its own key, not the last call overall: a second
    // setOptions effect (the nav title, Task 4) fires too, and it does not
    // carry headerRight.
    const headerRight = mocks.setOptions.mock.calls
      .map(([options]) => options.headerRight)
      .filter(Boolean)
      .at(-1);
    render(headerRight());
    fireEvent.click(screen.getByTestId('open-wbw'));

    // The surah on screen, not a hardcoded one: setOptions is re-run whenever
    // data.surah.id changes.
    expect(mocks.push).toHaveBeenCalledWith('/surah/2/words');
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
    const headerRight = mocks.setOptions.mock.calls
      .map(([options]) => options.headerRight)
      .filter(Boolean)
      .at(-1);
    expect(headerRight).toBeTypeOf('function');

    render(<div>{headerRight()}</div>);
    expect(screen.getByTestId('open-wbw')).toBeTruthy();
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

    const headerRight = mocks.setOptions.mock.calls
      .map(([options]) => options.headerRight)
      .filter(Boolean)
      .at(-1);
    render(<div>{headerRight()}</div>);

    // Closed until asked for: an always-mounted sheet leaves a full-screen
    // backdrop swallowing every tap in the reader.
    expect(screen.queryByTestId('language-sheet')).toBeNull();

    fireEvent.click(screen.getByTestId('open-language'));
    fireEvent.click(screen.getByTestId('pick-ru'));

    expect(onChangeContentLanguage).toHaveBeenCalledWith('ru');
  });

  function latestTitle() {
    return mocks.setOptions.mock.calls
      .map(([options]) => options.title)
      .filter((title) => title !== undefined)
      .at(-1);
  }

  it('leaves the nav title empty while the big heading is on screen', () => {
    render(<SurahReader {...baseProps(readerData(30))} />);

    // Duplicating the 24pt heading in the app bar on the first screenful is
    // exactly the doubled-up look CLAUDE.md §8 rules out.
    expect(latestTitle() ?? '').toBe('');
  });

  it('fills the nav title in once the heading scrolls away', () => {
    render(<SurahReader {...baseProps(readerData(30))} />);

    act(() => {
      mocks.headerLayout?.(180);
      mocks.onScroll?.({ nativeEvent: { contentOffset: { y: 200 } } });
    });

    expect(latestTitle()).toBe('Al-Baqarah');
  });

  it('empties it again on the way back up', () => {
    render(<SurahReader {...baseProps(readerData(30))} />);

    act(() => {
      mocks.headerLayout?.(180);
      mocks.onScroll?.({ nativeEvent: { contentOffset: { y: 200 } } });
      mocks.onScroll?.({ nativeEvent: { contentOffset: { y: 10 } } });
    });

    expect(latestTitle()).toBe('');
  });

  it('measures the threshold rather than assuming one', () => {
    // The header grows with the Arabic size setting and the OS font scale, so
    // a constant threshold flips the title at the wrong scroll position on any
    // device that is not the one it was tuned on.
    render(<SurahReader {...baseProps(readerData(30))} />);

    act(() => {
      mocks.headerLayout?.(600);
      mocks.onScroll?.({ nativeEvent: { contentOffset: { y: 200 } } });
    });

    expect(latestTitle() ?? '').toBe('');
  });

  it('holds the title back until the header has measured', () => {
    render(<SurahReader {...baseProps(readerData(30))} />);

    act(() => {
      mocks.onScroll?.({ nativeEvent: { contentOffset: { y: 200 } } });
    });

    // No onLayout yet: with no measured threshold, a naive `y > height` would
    // read 200 > 0 and flip the title on at the very top of the surah.
    expect(latestTitle() ?? '').toBe('');
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


function baseProps(data: ReturnType<typeof readerData>) {
  return {
    data,
    bookmarkedAyahs: new Set<number>(),
    playingAyah: null,
    audioEnabled: false,
    uiLocale: 'en' as const,
    onToggleBookmark: vi.fn(),
    onToggleAudio: vi.fn(),
    contentLanguage: 'en' as const,
    onChangeContentLanguage: vi.fn(),
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
