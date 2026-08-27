import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LemmaEntry } from '@quran-corpus/data/mobile';
import type * as EntryTransition from '@/motion/useEntryTransition';
import { LemmaScreen } from './LemmaScreen';

const mocks = vi.hoisted(() => ({
  getLemmaScreen: vi.fn(),
  getLemmaOccurrences: vi.fn(),
  getAdjacentLemmas: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  markSide: vi.fn(),
}));

vi.mock('@/data/corpusRepository', () => ({
  getLemmaScreen: (...args: unknown[]) => mocks.getLemmaScreen(...args),
  getLemmaOccurrences: (...args: unknown[]) => mocks.getLemmaOccurrences(...args),
  getAdjacentLemmas: (...args: unknown[]) => mocks.getAdjacentLemmas(...args),
}));
// Only the direction is stubbed. The hook itself is covered by its own suite;
// what this one has to pin down is that the screen forwards the side at all --
// it silently dropped it when the pager was first wired, so Previous and Next
// both arrived with no direction (M6g check 92).
vi.mock('@/motion/useEntryTransition', async (importOriginal) => ({
  ...(await importOriginal<typeof EntryTransition>()),
  useEntryTransition: () => ({ style: {}, markSide: mocks.markSide }),
}));
vi.mock('@/data/openCorpusDb', () => ({ openCorpusDb: () => Promise.resolve({}) }));
vi.mock('@quran-corpus/mobile-data', () => ({ createExpoSqliteClient: () => ({}) }));
// contentLanguage deliberately not 'en': loadPage takes a hardcoded 'en' and
// every assertion below still passes, so this pins down that the value
// actually came from settings. uiLocale stays 'en' -- other tests assert
// English UI strings.
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', contentLanguage: 'ru', arabicScale: 'medium' }),
}));

// Stubbed to the props LemmaScreen hands it: this suite is about what the
// screen renders and forwards, and ConcordanceList's own paging has its own
// suite. loadPage is driven from an effect, same as RootRoute.test.tsx, so
// LemmaScreen's paged query actually runs instead of sitting unexercised.
vi.mock('@/components/ConcordanceList', async () => {
  const React = await import('react');
  return {
    ConcordanceList: ({
      total,
      loadPage,
      header,
    }: {
      total: number;
      loadPage: (offset: number, limit: number) => Promise<unknown[]>;
      header: React.ReactElement;
    }) => {
      React.useEffect(() => {
        void loadPage(0, 20);
      }, [loadPage]);
      return React.createElement(
        'div',
        { 'data-testid': 'concordance', 'data-total': String(total) },
        header,
      );
    },
  };
});

// InfoSheet has its own suite (InfoSheet.test.tsx). Stubbed here to a bare
// button/body pair so this suite covers only what LemmaScreen hands it --
// the label and body strings, and where in the tree each one lands -- without
// pulling BottomSheet's reanimated and gesture-handler dependencies into a
// screen suite that isn't about them. Neither stub holds state: the open state
// is the screen's, which is the whole reason the two are separate components.
vi.mock('@/components/InfoSheet', async () => {
  const React = await import('react');
  return {
    InfoButton: ({ label, onPress }: { label: string; onPress: () => void }) =>
      React.createElement('button', { 'data-testid': 'info-button', onClick: onPress }, label),
    InfoSheet: ({ body }: { body: string }) =>
      React.createElement('div', { 'data-testid': 'info-body' }, body),
  };
});

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Link: ({ href, testID, children }: { href: string; testID?: string; children: React.ReactNode }) =>
      React.createElement('a', { href, 'data-testid': testID }, children),
    router: { push: mocks.push, replace: mocks.replace },
  };
});

// reactNativeTextMock, not the bare `host` factory: the header now renders
// EntryHeader and DefinitionCard, both of which mount ClampedText, and the
// sense chips need Pressable-free Views -- see RootRoute.test.tsx's identical
// note on the same switch.
vi.mock('react-native', async () => {
  const React = await import('react');
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    ...reactNativeTextMock(),
  };
});

// Shared fixture for the tests that only vary one or two fields -- spread and
// override rather than repeating the full shape every time (as the pre-M5
// tests below still do, since they predate this fixture).
const LEMMA: LemmaEntry = {
  lemma: 'قَالَ',
  lemma_buckwalter: 'qAl',
  transliteration: 'qāla',
  root_buckwalter: 'qwl',
  count: 1722,
  senses: [{ pos_tag: 'V', pos_label: 'Verb', count: 1722 }],
  top_glosses: ['said', 'say'],
  root_definition: null,
  root_definition_source: null,
};

describe('LemmaScreen', () => {
  beforeEach(() => {
    mocks.getLemmaScreen.mockReset();
    mocks.getLemmaOccurrences.mockReset();
    mocks.getAdjacentLemmas.mockReset();
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.getLemmaOccurrences.mockResolvedValue([]);
    mocks.getAdjacentLemmas.mockResolvedValue({ prev: null, next: null });
    // Default resolution so a test that only cares about the info button (or
    // any other fixed part of the header) doesn't also have to stub the load.
    // Tests that care about the loaded entry override this explicitly.
    mocks.getLemmaScreen.mockResolvedValue({ entry: LEMMA, total: LEMMA.count });
  });
  afterEach(cleanup);

  it('renders the not-found state for an invalid identifier', () => {
    render(<LemmaScreen lemmaBuckwalter={null} source={null} />);

    // queryBy, not getBy: getBy throws on a miss, which would fail this test
    // the same way for "wrong text" and for "unrelated render crash" -- the
    // toBeNull comparisons below are what actually pin the two facts down.
    const alert = screen.queryByText('This lemma is not in the corpus');
    expect(alert).not.toBeNull();
    expect(alert?.getAttribute('role')).toBe('alert');
    // Validated before the DB is opened.
    expect(mocks.getLemmaScreen).not.toHaveBeenCalled();
  });

  it('passes the occurrence total down to the list', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: {
        lemma: 'قَالَ',
        lemma_buckwalter: 'qAl',
        transliteration: null,
        root_buckwalter: 'qwl',
        count: 3,
        senses: [],
        top_glosses: [],
        root_definition: null,
        root_definition_source: null,
      },
      total: 1722,
    });

    render(<LemmaScreen lemmaBuckwalter="qAl" source={null} />);

    // From countLemmaConcordance (1722), not from the entry's own count (3):
    // the entry query groups occurrences away, and paging off that number
    // truncates the list at the wrong place.
    await waitFor(() => {
      const node = screen.queryByTestId('concordance');
      expect(node).not.toBeNull();
      expect(node?.getAttribute('data-total')).toBe('1722');
    });

    // The root Stack renders a blank nav title (see app/_layout.tsx), so this
    // heading is the only thing on screen that names the lemma for TalkBack's
    // heading navigation. 'heading' (ARIA-aligned), not the legacy 'header':
    // EntryHeader sets role="heading" directly rather than
    // accessibilityRole="header", which rnHosts maps to the banner landmark
    // role instead -- see EntryHeader.tsx's own note on the same mapping.
    expect(screen.getByText('قَالَ').getAttribute('role')).toBe('heading');
  });

  it('loads the concordance page in the reader\'s content language', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: {
        lemma: 'قَالَ',
        lemma_buckwalter: 'qAl',
        transliteration: null,
        root_buckwalter: 'qwl',
        count: 3,
        senses: [],
        top_glosses: [],
        root_definition: null,
        root_definition_source: null,
      },
      total: 1722,
    });

    render(<LemmaScreen lemmaBuckwalter="qAl" source={null} />);

    // Settings mocks 'ru', not 'en': a loadPage that hardcodes 'en' would
    // still pass a version of this assertion pinned to 'en'.
    await waitFor(() =>
      expect(mocks.getLemmaOccurrences).toHaveBeenCalledWith(
        expect.anything(),
        'qAl',
        'ru',
        0,
        20,
      ),
    );
  });

  it('labels the top glosses as translations, not as the lemma meaning', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: {
        lemma: 'ضَرَبَ',
        lemma_buckwalter: 'Darab',
        transliteration: null,
        root_buckwalter: null,
        count: 5,
        senses: [],
        top_glosses: ['Allah sets forth', 'struck'],
        root_definition: null,
        root_definition_source: null,
      },
      total: 5,
    });

    render(<LemmaScreen lemmaBuckwalter="Darab" source={null} />);

    await waitFor(() => expect(screen.queryByTestId('concordance')).not.toBeNull());
    expect(screen.queryByText('Translated as')).not.toBeNull();
    expect(screen.queryByText('Allah sets forth · struck')).not.toBeNull();
  });

  it('links to the lemma root when it has one', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: {
        lemma: 'آبَ',
        lemma_buckwalter: '>Ab',
        transliteration: null,
        // '>' is a Buckwalter letter and an unsafe path character: the href
        // must carry it percent-encoded or the root route 404s.
        root_buckwalter: '>wb',
        count: 1,
        senses: [],
        top_glosses: [],
        root_definition: null,
        root_definition_source: null,
      },
      total: 1,
    });

    render(<LemmaScreen lemmaBuckwalter=">Ab" source={null} />);

    await waitFor(() => expect(screen.queryByTestId('lemma-root')).not.toBeNull());
    const link = screen.queryByTestId('lemma-root');
    expect(link?.getAttribute('href')).toBe('/root/%3Ewb');
    // 'lemma.viewRoot' ("View root"), not the shared 'word.root' ("Root") key
    // the WbW popover uses: the link now sits below a definition/no-definition
    // line, and a bare "Root" there reads as a repeat of the caption above it.
    expect(link?.textContent).toBe('View root');
  });

  it('renders no root link when the lemma has no root', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: {
        lemma: 'مَا',
        lemma_buckwalter: 'mA',
        transliteration: null,
        root_buckwalter: null,
        count: 1,
        senses: [],
        top_glosses: [],
        root_definition: null,
        root_definition_source: null,
      },
      total: 1,
    });

    render(<LemmaScreen lemmaBuckwalter="mA" source={null} />);

    await waitFor(() => expect(screen.queryByTestId('concordance')).not.toBeNull());
    expect(screen.queryByTestId('lemma-root')).toBeNull();
  });

  it('shows the headword, its reading and how often it occurs', async () => {
    mocks.getLemmaScreen.mockResolvedValue({ entry: LEMMA, total: 1722 });
    render(<LemmaScreen lemmaBuckwalter="qaAla" source={null} />);
    // .textContent, not the jest-dom toHaveTextContent matcher: jest-dom is
    // an apps/web dependency only (see DefinitionCard.test.tsx).
    expect((await screen.findByTestId('entry-translit')).textContent).toContain('qāla');
    expect(screen.getByTestId('entry-count').textContent).toContain('1722 occurrences');
  });

  it('breaks the lemma down by grammatical sense', async () => {
    // مَا is tagged six ways; naming only the commonest misdescribes 42% of its
    // occurrences, and the counts explain why the concordance below is mixed.
    mocks.getLemmaScreen.mockResolvedValue({
      entry: {
        ...LEMMA,
        senses: [
          { pos_tag: 'REL', pos_label: 'Relative pronoun', count: 1266 },
          { pos_tag: 'NEG', pos_label: 'Negative particle', count: 704 },
        ],
      },
      total: 2177,
    });
    render(<LemmaScreen lemmaBuckwalter="mA" source={null} />);
    const chips = await screen.findAllByTestId('sense-chip');
    expect(chips).toHaveLength(2);
    // noUncheckedIndexedAccess: array indexing widens to T | undefined.
    expect(chips[0]!.textContent).toContain('1266');
  });

  it('omits the count on a single-sense lemma', async () => {
    // With one sense it duplicates the "occurs N times" line right above it.
    mocks.getLemmaScreen.mockResolvedValue({
      entry: { ...LEMMA, senses: [{ pos_tag: 'V', pos_label: 'Verb', count: 1722 }] },
      total: 1722,
    });
    render(<LemmaScreen lemmaBuckwalter="qaAla" source={null} />);
    expect((await screen.findByTestId('sense-chip')).textContent).not.toContain('1722');
  });

  it('explains the glosses behind an info button rather than in body text', async () => {
    render(<LemmaScreen lemmaBuckwalter="qaAla" source={null} />);
    fireEvent.click(await screen.findByTestId('info-button'));
    expect(screen.getByTestId('info-body').textContent).toContain('not dictionary definitions');
  });

  it('mounts the sheet outside the concordance, not in its scrolling header', async () => {
    // BottomSheet is StyleSheet.absoluteFill with no Modal or portal, so it
    // fills its PARENT. Mounted where the button is -- inside the FlatList
    // header, inside a 20dp row -- the backdrop and panel lay out inside that
    // row and scroll away with the list. Only the button belongs in the header.
    render(<LemmaScreen lemmaBuckwalter="qaAla" source={null} />);
    fireEvent.click(await screen.findByTestId('info-button'));

    const concordance = screen.getByTestId('concordance');
    expect(concordance.contains(screen.getByTestId('info-button'))).toBe(true);
    expect(concordance.contains(screen.getByTestId('info-body'))).toBe(false);
  });

  it('hides the list from TalkBack while the sheet is up', async () => {
    // accessibilityViewIsModal is iOS-only; without this the reader can swipe
    // straight past the sheet into the rows behind it.
    render(<LemmaScreen lemmaBuckwalter="qaAla" source={null} />);
    // By testID, not by walking up from the list: the pager's animated wrapper
    // now sits between them, and a parentElement chain would have to be
    // re-counted every time the tree gains a level.
    const wrapper = () => screen.getByTestId('lemma-content');
    await screen.findByTestId('concordance');
    await waitFor(() => expect(wrapper().getAttribute('data-hidden-from-a11y')).toBeNull());

    fireEvent.click(screen.getByTestId('info-button'));
    expect(wrapper().getAttribute('data-hidden-from-a11y')).toBe('true');
  });

  it('carries the root definition with its credit', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: { ...LEMMA, root_definition: 'to say', root_definition_source: 'lane' },
      total: 5,
    });
    render(<LemmaScreen lemmaBuckwalter="qaAla" source={null} />);
    expect((await screen.findByTestId('definition-card')).textContent).toContain('to say');
    expect(screen.getByTestId('definition-source').textContent).toContain("Lane's Lexicon");
  });

  it('says the lexicon has no entry rather than showing an empty card', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: { ...LEMMA, root_definition: null, root_definition_source: null },
      total: 5,
    });
    render(<LemmaScreen lemmaBuckwalter="qaAla" source={null} />);
    expect(await screen.findByTestId('lemma-no-definition')).toBeTruthy();
  });

  it('hides the root section entirely for a rootless lemma', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: { ...LEMMA, root_buckwalter: null, root_definition: null },
      total: 5,
    });
    render(<LemmaScreen lemmaBuckwalter="qaAla" source={null} />);
    await screen.findByTestId('entry-count');
    expect(screen.queryByTestId('lemma-root')).toBeNull();
    expect(screen.queryByTestId('lemma-no-definition')).toBeNull();
  });

  it('captions the slim header with the reading, and omits it when there is none', async () => {
    // D3 sent frame 3's "rank 41 of 200" into the slim bar. The rank itself is
    // not on this screen -- getAdjacentLemmas returns neighbours, not a
    // position, and M6g adds no queries -- so the reading is what captions it.
    // A caption node with nothing in it lays the title against a gap instead
    // of against the right edge.
    render(<LemmaScreen lemmaBuckwalter="qaAla" source={null} />);
    expect((await screen.findByTestId('lemma-header-caption')).textContent).toBe('qāla');

    cleanup();
    mocks.getLemmaScreen.mockResolvedValue({
      entry: { ...LEMMA, transliteration: null },
      total: LEMMA.count,
    });
    render(<LemmaScreen lemmaBuckwalter="qaAla" source={null} />);

    await screen.findByTestId('lemma-header');
    expect(screen.queryByTestId('lemma-header-caption')).toBeNull();
  });

  it('counts the concordance beside its heading', async () => {
    // The count moved out of the heading string into its own node when the row
    // became an eyebrow with a right-aligned total (m6g-3/-4). Both halves are
    // still asserted: the heading alone says nothing about size, and a bare
    // number says nothing about what it counts.
    mocks.getLemmaScreen.mockResolvedValue({ entry: LEMMA, total: 1722 });
    render(<LemmaScreen lemmaBuckwalter="qaAla" source={null} />);
    expect((await screen.findByTestId('concordance-heading')).textContent).toBe('Concordance');
    expect(screen.getByTestId('concordance-count').textContent).toBe('1722');
  });

  it('pages through the ranking it was entered from', async () => {
    mocks.getAdjacentLemmas.mockResolvedValue({ prev: 'qwl', next: 'ktb' });

    render(<LemmaScreen lemmaBuckwalter="brk" source="verbs" />);

    // The ranking travels with the request: a verb sits at a different rank in
    // the verb list than in the lemma list, so a hardcoded 'lemmas' here would
    // page somewhere the reader never was.
    await waitFor(() => expect(mocks.getAdjacentLemmas).toHaveBeenCalled());
    expect(mocks.getAdjacentLemmas.mock.calls[0]!.slice(1)).toEqual(['brk', 'verbs']);

    fireEvent.click(await screen.findByTestId('lemma-next'));
    expect(mocks.replace).toHaveBeenCalledWith('/lemma/ktb?from=verbs');
    // D4: which button was pressed is what decides the slide's direction, and
    // the navigation itself carries no direction to recover it from.
    expect(mocks.markSide).toHaveBeenCalledWith('next');

    fireEvent.click(screen.getByTestId('lemma-previous'));
    expect(mocks.markSide).toHaveBeenLastCalledWith('prev');
  });

  it('drops the old neighbours while the new lemma is still resolving', async () => {
    // A lemma change in place -- router.replace, or a deep link landing on the
    // mounted route -- refetches, and the verb aggregate is the slowest query
    // on this screen. Held-over arrows would point at the PREVIOUS lemma's
    // neighbours, so Next would navigate somewhere the reader never was.
    mocks.getAdjacentLemmas.mockResolvedValue({ prev: 'qwl', next: 'ktb' });
    const { rerender } = render(<LemmaScreen lemmaBuckwalter="brk" source="verbs" />);
    await waitFor(() =>
      expect((screen.getByTestId('lemma-next') as HTMLButtonElement).disabled).toBe(false),
    );

    let settle: (value: { prev: string | null; next: string | null }) => void = () => {};
    mocks.getAdjacentLemmas.mockReturnValue(
      new Promise<{ prev: string | null; next: string | null }>((resolve) => {
        settle = resolve;
      }),
    );
    rerender(<LemmaScreen lemmaBuckwalter="qaAla" source="verbs" />);

    await waitFor(() =>
      expect((screen.getByTestId('lemma-next') as HTMLButtonElement).disabled).toBe(true),
    );
    settle({ prev: null, next: 'kaAna' });
    await waitFor(() => expect(mocks.getAdjacentLemmas).toHaveBeenCalledTimes(2));
  });

  it('dims both arrows for a deep link that names no ranking', async () => {
    render(<LemmaScreen lemmaBuckwalter="brk" source={null} />);

    const previous = (await screen.findByTestId('lemma-previous')) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    expect((screen.getByTestId('lemma-next') as HTMLButtonElement).disabled).toBe(true);
    // No ranking means there is no query to run.
    expect(mocks.getAdjacentLemmas).not.toHaveBeenCalled();
  });
});
