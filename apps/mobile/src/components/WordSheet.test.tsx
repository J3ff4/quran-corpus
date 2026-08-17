import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Word, WordSegment } from '@quran-corpus/data/mobile';
import type { WordSummary } from '@/data/corpusRepository';
import { SPRING_DAMPING_RATIO, WordSheet } from './WordSheet';

const mocks = vi.hoisted(() => ({
  backPress: null as (() => boolean) | null,
  backRemove: vi.fn(),
  // In declaration order: translateY, fade, sheetHeight. The pan gesture is
  // otherwise unreachable from a test -- GestureDetector is stubbed out -- and
  // the drag-to-dismiss branch is the one place the two values move apart.
  sharedValues: [] as Array<{ value: unknown }>,
  panEnd: null as ((event: { translationY: number; velocityY: number }) => void) | null,
}));

vi.mock('@/settings/settingsStore', () => ({
  // Not a provider: the real store pulls expo-sqlite into the jsdom module
  // graph, and every other component test here mocks it the same way. The
  // step only has to be one useArabicSizes recognises.
  useAppSettings: () => ({ arabicScale: 'medium' }),
}));

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');

  return {
    // Reached through useReducedMotion, which every render of the sheet calls.
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove: () => {} }),
    },
    BackHandler: {
      addEventListener: (_event: string, handler: () => boolean) => {
        mocks.backPress = handler;
        return { remove: mocks.backRemove };
      },
    },
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
    withSpring: (to: unknown) => to,
    withTiming: (to: unknown) => to,
  };
});

vi.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({ children }: { children?: React.ReactNode }) => children,
  Gesture: {
    Pan: () => {
      const chain = {
        enabled: () => chain,
        onUpdate: () => chain,
        onEnd: (handler: (event: { translationY: number; velocityY: number }) => void) => {
          mocks.panEnd = handler;
          return chain;
        },
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
    gloss?: string | null;
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
    gloss: overrides.gloss === undefined ? 'the entirely merciful' : overrides.gloss,
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
    mocks.backPress = null;
    mocks.backRemove.mockClear();
    mocks.sharedValues = [];
    mocks.panEnd = null;
  });

  afterEach(cleanup);

  it('renders nothing when there is no summary', () => {
    const { container } = render(<WordSheet summary={null} {...handlers} />);

    // Not "renders hidden": an always-mounted sheet keeps a full-screen
    // backdrop in the tree and swallows every tap in the reader.
    expect(container.firstChild).toBeNull();
  });

  it('restores the backdrop dim when a drag stops short of dismissing', () => {
    // withSpring is `(to) => to` in this mock, so these are the targets the
    // gesture commits to, not simulated frames.
    render(<WordSheet summary={summary()} {...handlers} />);
    const [translateY, fade] = mocks.sharedValues;
    expect(mocks.sharedValues).toHaveLength(3);

    // The real sequence: a dismissing drag starts the fade out, its spring is
    // interrupted by a second drag, and that one stops short. Starting from a
    // freshly opened sheet instead would assert nothing -- the entrance effect
    // already left `fade` at 1.
    mocks.panEnd?.({ translationY: 300, velocityY: 0 });
    expect(fade!.value).toBe(0);

    // Under a quarter of the 800px height and slow: the sheet springs back.
    mocks.panEnd?.({ translationY: 40, velocityY: 0 });

    expect(translateY!.value).toBe(0);
    // A dismiss whose spring is interrupted leaves `fade` heading for 0 and
    // never fires onClose, so the cancel path has to put it back -- otherwise
    // the sheet sits fully visible over an undimmed reader, with an invisible
    // backdrop still eating taps.
    expect(fade!.value).toBe(1);
  });

  it('drops the backdrop dim when the drag does dismiss', () => {
    render(<WordSheet summary={summary()} {...handlers} />);
    const [, fade] = mocks.sharedValues;

    mocks.panEnd?.({ translationY: 300, velocityY: 0 });

    expect(fade!.value).toBe(0);
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
    render(<WordSheet summary={summary({ gloss: 'the most merciful' })} {...handlers} />);

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

  it('closes on the Android back button instead of leaving the reader', () => {
    const onClose = vi.fn();
    render(<WordSheet summary={summary()} {...handlers} onClose={onClose} />);

    const handled = mocks.backPress?.();

    expect(onClose).toHaveBeenCalledTimes(1);
    // Returning false lets the press fall through to the navigator as well, so
    // one back tap would dismiss the sheet AND leave the surah.
    expect(handled).toBe(true);
  });

  it('stops intercepting back once it is closed', () => {
    const { rerender } = render(<WordSheet summary={summary()} {...handlers} />);

    rerender(<WordSheet summary={null} {...handlers} />);

    // Left subscribed, the closed sheet swallows every back press in the app.
    expect(mocks.backRemove).toHaveBeenCalled();
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

  it('opens without overshooting', () => {
    // ζ >= 1 is critically damped: the sheet settles at its resting position
    // instead of passing it and coming back. Owner report 2026-08-16 called the
    // ported web value "too springy and jumpy" on device.
    expect(SPRING_DAMPING_RATIO).toBeGreaterThanOrEqual(1);
    // And not so stiff it stops reading as a spring at all.
    expect(SPRING_DAMPING_RATIO).toBeLessThan(1.2);
  });
});
