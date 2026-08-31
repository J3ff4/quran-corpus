import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Word, WordSegment } from '@quran-corpus/data/mobile';
import type { Gloss, WordSummary } from '@/data/corpusRepository';
import { WordSheet } from './WordSheet';

const mocks = vi.hoisted(() => ({
  // In declaration order: translateY, fade, sheetHeight. Not asserted by any
  // test here -- the drag/timing/back-button behaviour they'd exercise now
  // lives in BottomSheet.test.tsx -- but useSharedValue still needs somewhere
  // to record the values it hands out.
  sharedValues: [] as Array<{ value: unknown }>,
}));

vi.mock('@/settings/settingsStore', () => ({
  // Not a provider: the real store pulls expo-sqlite into the jsdom module
  // graph, and every other component test here mocks it the same way. The
  // step only has to be one useArabicSizes recognises.
  useAppSettings: () => ({ arabicScale: 'medium' }),
}));

vi.mock('react-native', async () => {
  const { Modal, host } = await import('@/testing/rnHosts.js');

  return {
    // Reached through useReducedMotion, which every render of the sheet calls.
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove: () => {} }),
    },
    BackHandler: {
      addEventListener: () => ({ remove: () => {} }),
    },
    // The sheet lives in a Modal so it can cover the navigator's tab pill.
    Modal,
    Pressable: host('button'),
    StyleSheet: { absoluteFill: {} },
    Text: host('span'),
    View: host('div'),
    useWindowDimensions: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
  };
});

// Animation is not simulated: useAnimatedStyle returns nothing, so no test can
// accidentally assert on a transform the mock invented. What the sheet does --
// mount, dismiss, navigate -- is observable without a single frame.
vi.mock('react-native-reanimated', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return {
    default: {
      View: host('div'),
      createAnimatedComponent: (Component: unknown) => Component,
    },
    runOnJS: (fn: unknown) => fn,
    useAnimatedStyle: () => ({}),
    useSharedValue: (initial: unknown) => {
      const shared = { value: initial };
      mocks.sharedValues.push(shared);
      return shared;
    },
    withTiming: (to: unknown) => to,
    Easing: {
      cubic: (t: number) => t,
      in: (fn: unknown) => fn,
      out: (fn: unknown) => fn,
    },
  };
});

vi.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children?: React.ReactNode }) => children,
  // The sheet mounts its own root inside the Modal -- see BottomSheet.
  GestureHandlerRootView: ({ children }: { children?: React.ReactNode }) => children,
  Gesture: {
    Pan: () => {
      const chain = {
        enabled: () => chain,
        onUpdate: () => chain,
        onEnd: () => chain,
      };
      return chain;
    },
  },
}));

function seg(index: number, posTag: string): WordSegment {
  return {
    id: 500 + index,
    word_id: 42,
    segment_index: index,
    segment_type: 'stem',
    pos_tag: posTag,
    form_arabic: null,
    form_buckwalter: null,
    features_json: null,
    lemma: null,
    root: null,
  };
}

function word(): Word {
  return {
    id: 42,
    ayah_id: 201,
    position: 1,
    text_arabic: 'ٱلرَّحْمَٰنِ',
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
  };
}

function summary(
  overrides: {
    wordId?: number;
    root?: string | null;
    rootArabic?: string | null;
    segments?: WordSegment[];
    gloss?: Gloss | null;
  } = {},
): WordSummary {
  return {
    word: {
      ...word(),
      ...(overrides.wordId === undefined ? {} : { id: overrides.wordId }),
      root_buckwalter: overrides.root ?? null,
      root: overrides.rootArabic ?? null,
    },
    segments: overrides.segments ?? [seg(1, 'N')],
    gloss:
      overrides.gloss === undefined
        ? { text: 'the entirely merciful', lang: 'en', isFallback: false }
        : overrides.gloss,
  };
}

const handlers = {
  uiLocale: 'en' as const,
  onClose: () => {},
  onOpenDetail: () => {},
  onOpenRoot: () => {},
};

describe('WordSheet', () => {
  beforeEach(() => {
    mocks.sharedValues = [];
  });

  afterEach(cleanup);

  it('renders nothing when there is no summary', () => {
    const { container } = render(<WordSheet summary={null} {...handlers} />);

    // Not "renders hidden": an always-mounted sheet keeps a full-screen
    // backdrop in the tree and swallows every tap in the reader.
    expect(container.firstChild).toBeNull();
  });

  it('announces itself as a modal dialog', () => {
    render(<WordSheet summary={summary()} {...handlers} />);

    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('shows one pill per segment, in segment order', () => {
    render(<WordSheet summary={summary({ segments: [seg(0, 'DET'), seg(1, 'N')] })} {...handlers} />);

    const pills = screen.getAllByTestId('segment-pill');
    expect(pills).toHaveLength(2);
    expect(pills[0]!.textContent).toMatch(/determiner/i);
  });

  it('shows the gloss when there is one', () => {
    render(<WordSheet summary={summary({ gloss: { text: 'the most merciful', lang: 'en', isFallback: false } })} {...handlers} />);

    expect(screen.getByText('the most merciful')).toBeTruthy();
  });

  it('says so when there is no gloss instead of leaving a blank', () => {
    render(<WordSheet summary={summary({ gloss: null })} {...handlers} />);

    expect(screen.getByText(/no translation/i)).toBeTruthy();
  });

  it('closes on backdrop press', () => {
    const onClose = vi.fn();
    render(<WordSheet summary={summary()} {...handlers} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('sheet-backdrop'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when the sheet body itself is pressed', () => {
    // The backdrop is a sibling, not a parent -- nesting the sheet inside it
    // makes every tap on the sheet bubble to the dismiss handler and the
    // sheet closes the moment the user reaches for a link.
    const onClose = vi.fn();
    render(<WordSheet summary={summary()} {...handlers} onClose={onClose} />);

    fireEvent.click(screen.getByRole('dialog'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens the full analysis for the word it is showing', () => {
    const onOpenDetail = vi.fn();
    render(<WordSheet summary={summary({ wordId: 42 })} {...handlers} onOpenDetail={onOpenDetail} />);

    fireEvent.click(screen.getByText(/full analysis/i));

    expect(onOpenDetail).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
  });

  it('links to the root when the word has one', () => {
    const onOpenRoot = vi.fn();
    render(
      <WordSheet
        summary={summary({ root: 'rHm', rootArabic: 'رحم' })}
        {...handlers}
        onOpenRoot={onOpenRoot}
      />,
    );

    fireEvent.click(screen.getByText(/رحم/));

    // Buckwalter, not the Arabic: it is the key every root query takes, and
    // handing the screen the display string routes to nothing.
    expect(onOpenRoot).toHaveBeenCalledWith('rHm');
  });

  it('falls back to the buckwalter root when the corpus has no Arabic one', () => {
    render(<WordSheet summary={summary({ root: 'rHm', rootArabic: null })} {...handlers} />);

    // Not a blank label beside the word "Root": some rows carry only the
    // transliteration, and a bare heading reads as a rendering fault.
    expect(screen.getByTestId('root-link').textContent).toMatch(/rHm/);
  });

  it('omits the root link entirely for a word with no root', () => {
    // Particles and pronouns have no root. A dead link that navigates to an
    // empty root screen is worse than no link.
    render(<WordSheet summary={summary({ root: null })} {...handlers} />);

    expect(screen.queryByTestId('root-link')).toBeNull();
  });

  it('gives every action a 48dp touch target', () => {
    render(<WordSheet summary={summary({ root: 'rHm' })} {...handlers} />);

    for (const id of ['full-analysis', 'root-link']) {
      expect(Number(screen.getByTestId(id).style.minHeight.replace('px', ''))).toBeGreaterThanOrEqual(48);
    }
  });

  it('marks a gloss that fell back to another language', () => {
    render(
      <WordSheet
        summary={summary({ gloss: { text: 'the Entirely Merciful', lang: 'en', isFallback: true } })}
        {...handlers}
      />,
    );

    // Web has always done this (WordPopover renders `({glossLang})`); mobile
    // dropped gloss_lang on the way through and showed English as Russian.
    expect(screen.getByTestId('gloss-lang-en').textContent).toBe('(en)');
  });

  it('does not mark a gloss already in the requested language', () => {
    render(<WordSheet summary={summary({})} {...handlers} />);

    expect(screen.queryByTestId('gloss-lang-en')).toBeNull();
  });

  it('gives the two ways deeper a row treatment, not a bare text run', () => {
    // Most-tapped sheet in the app: every word in word-by-word opens it.
    render(<WordSheet summary={summary({ root: 'rHm' })} {...handlers} />);

    expect(screen.getByTestId('full-analysis').style.minHeight).toBe('48px');
    expect(screen.getByTestId('root-link').style.minHeight).toBe('48px');
  });

  it('draws a chevron on both rows, not a bare label', () => {
    // Closes the outstanding SheetRow finding: `trailingIcon` had no consumer
    // passing a non-empty value anywhere in the suite, so a mutant that
    // hardcoded SheetRow's `icon` to `undefined` (SheetRow.tsx:36) survived
    // the whole run. WordSheet is the first caller to pass `trailingIcon`.
    render(<WordSheet summary={summary({ root: 'rHm' })} {...handlers} />);

    expect(screen.getAllByTestId('icon-chevronRight')).toHaveLength(2);
  });
});
