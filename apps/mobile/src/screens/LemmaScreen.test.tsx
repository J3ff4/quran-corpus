import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LemmaEntry } from '@quran-corpus/data/mobile';
import { LemmaScreen } from './LemmaScreen';

const mocks = vi.hoisted(() => ({
  getLemmaScreen: vi.fn(),
  getLemmaOccurrences: vi.fn(),
}));

vi.mock('@/data/corpusRepository', () => ({
  getLemmaScreen: (...args: unknown[]) => mocks.getLemmaScreen(...args),
  getLemmaOccurrences: (...args: unknown[]) => mocks.getLemmaOccurrences(...args),
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
// the label and body strings -- without pulling BottomSheet's reanimated and
// gesture-handler dependencies into a screen suite that isn't about them.
vi.mock('@/components/InfoSheet', async () => {
  const React = await import('react');
  return {
    InfoSheet: ({ label, body }: { label: string; body: string }) => {
      const [open, setOpen] = React.useState(false);
      return React.createElement(
        React.Fragment,
        null,
        React.createElement(
          'button',
          { 'data-testid': 'info-button', onClick: () => setOpen(true) },
          label,
        ),
        open ? React.createElement('div', { 'data-testid': 'info-body' }, body) : null,
      );
    },
  };
});

vi.mock('expo-router', async () => {
  const React = await import('react');
  return {
    Link: ({ href, testID, children }: { href: string; testID?: string; children: React.ReactNode }) =>
      React.createElement('a', { href, 'data-testid': testID }, children),
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
    mocks.getLemmaOccurrences.mockResolvedValue([]);
    // Default resolution so a test that only cares about the info button (or
    // any other fixed part of the header) doesn't also have to stub the load.
    // Tests that care about the loaded entry override this explicitly.
    mocks.getLemmaScreen.mockResolvedValue({ entry: LEMMA, total: LEMMA.count });
  });
  afterEach(cleanup);

  it('renders the not-found state for an invalid identifier', () => {
    render(<LemmaScreen lemmaBuckwalter={null} />);

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

    render(<LemmaScreen lemmaBuckwalter="qAl" />);

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

    render(<LemmaScreen lemmaBuckwalter="qAl" />);

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

    render(<LemmaScreen lemmaBuckwalter="Darab" />);

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
        // '>' is a Buckwalter letter and an unsafe path character (see
        // LetterScreen's equivalent case): the href must carry it
        // percent-encoded or the root route 404s.
        root_buckwalter: '>wb',
        count: 1,
        senses: [],
        top_glosses: [],
        root_definition: null,
        root_definition_source: null,
      },
      total: 1,
    });

    render(<LemmaScreen lemmaBuckwalter=">Ab" />);

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

    render(<LemmaScreen lemmaBuckwalter="mA" />);

    await waitFor(() => expect(screen.queryByTestId('concordance')).not.toBeNull());
    expect(screen.queryByTestId('lemma-root')).toBeNull();
  });

  it('shows the headword, its reading and how often it occurs', async () => {
    mocks.getLemmaScreen.mockResolvedValue({ entry: LEMMA, total: 1722 });
    render(<LemmaScreen lemmaBuckwalter="qaAla" />);
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
    render(<LemmaScreen lemmaBuckwalter="mA" />);
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
    render(<LemmaScreen lemmaBuckwalter="qaAla" />);
    expect((await screen.findByTestId('sense-chip')).textContent).not.toContain('1722');
  });

  it('explains the glosses behind an info button rather than in body text', async () => {
    render(<LemmaScreen lemmaBuckwalter="qaAla" />);
    fireEvent.click(await screen.findByTestId('info-button'));
    expect(screen.getByTestId('info-body').textContent).toContain('not dictionary definitions');
  });

  it('carries the root definition with its credit', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: { ...LEMMA, root_definition: 'to say', root_definition_source: 'lane' },
      total: 5,
    });
    render(<LemmaScreen lemmaBuckwalter="qaAla" />);
    expect((await screen.findByTestId('definition-card')).textContent).toContain('to say');
    expect(screen.getByTestId('definition-source').textContent).toContain("Lane's Lexicon");
  });

  it('says the lexicon has no entry rather than showing an empty card', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: { ...LEMMA, root_definition: null, root_definition_source: null },
      total: 5,
    });
    render(<LemmaScreen lemmaBuckwalter="qaAla" />);
    expect(await screen.findByTestId('lemma-no-definition')).toBeTruthy();
  });

  it('hides the root section entirely for a rootless lemma', async () => {
    mocks.getLemmaScreen.mockResolvedValue({
      entry: { ...LEMMA, root_buckwalter: null, root_definition: null },
      total: 5,
    });
    render(<LemmaScreen lemmaBuckwalter="qaAla" />);
    await screen.findByTestId('entry-count');
    expect(screen.queryByTestId('lemma-root')).toBeNull();
    expect(screen.queryByTestId('lemma-no-definition')).toBeNull();
  });

  it('counts the concordance in its heading', async () => {
    mocks.getLemmaScreen.mockResolvedValue({ entry: LEMMA, total: 1722 });
    render(<LemmaScreen lemmaBuckwalter="qaAla" />);
    expect((await screen.findByTestId('concordance-heading')).textContent).toContain('Concordance (1722)');
  });
});
