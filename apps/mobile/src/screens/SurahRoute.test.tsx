import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SurahRoute from '../../app/surah/[surahId]';
import { deferred } from '../testing/deferred';

const mocks = vi.hoisted(() => ({
  setContinuousPlay: vi.fn(),
  params: { surahId: '2' } as Record<string, string>,
  setBookmark: vi.fn(),
  recordReadingPosition: vi.fn(),
  recordReadingDay: vi.fn(),
  uiLocale: 'en',
  getSurahReader: vi.fn(),
  getWordsForAyah: vi.fn(),
  getBookmarks: vi.fn(),
  setBookmarkNote: vi.fn(),
  pageSurahProps: [] as ((surahId: number, side: 'prev' | 'next') => void)[],
  alerts: [] as { title: string; body: string; buttons: { text: string; onPress?: () => void }[] }[],
}));

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mocks.params,
}));

vi.mock('@quran-corpus/mobile-data', () => ({
  createExpoSqliteClient: (db: unknown) => db,
}));

vi.mock('@/audio/ayahAudio', () => ({
  useRecitation: () => ({
    ayah: null,
    playing: false,
    positionSec: 0,
    durationSec: Number.NaN,
    error: null,
    continuous: false,
    toggleAyah: vi.fn(),
    seekTo: vi.fn(),
    skipNext: vi.fn(),
    skipPrevious: vi.fn(),
  }),
}));

vi.mock('@/components/SurahReader', async () => {
  const React = await import('react');
  return {
    // `loadWords` is destructured and driven, not dropped: a function prop a
    // mock omits renders nothing, so no assertion in this file could ever see
    // it and the route's own loader would sit unexercised (F1).
    SurahReader: ({ onToggleBookmark, onEditNote, notesByAyah, onReadingAyah, bookmarkedAyahs, loadWords, prevSurahId, nextSurahId, onPageSurah, initialAyahNumber }: {
      onToggleBookmark: (ayahNumber: number) => void;
      onEditNote?: (ayahNumber: number) => void;
      notesByAyah?: Map<number, string | null>;
      onReadingAyah?: (ayahNumber: number) => void;
      bookmarkedAyahs: Set<number>;
      loadWords: (ayahId: number) => Promise<unknown[]>;
      prevSurahId?: number | null;
      nextSurahId?: number | null;
      onPageSurah?: (surahId: number, side: 'prev' | 'next') => void;
      initialAyahNumber?: number | null;
    }) => {
      // Recorded rather than asserted here: the route rebuilds the reader's
      // whole header when this changes identity, and it re-renders on every
      // playback tick, so its stability is the thing worth pinning.
      if (onPageSurah) mocks.pageSurahProps.push(onPageSurah);
      return React.createElement(
        'div',
        null,
        React.createElement('span', null, 'reader-content'),
        React.createElement('span', null, `anchor:${initialAyahNumber ?? 'none'}`),
        React.createElement('span', null, `adjacent:${prevSurahId ?? 'none'}/${nextSurahId ?? 'none'}`),
        React.createElement(
          'button',
          { onClick: () => nextSurahId && onPageSurah?.(nextSurahId, 'next') },
          'page next',
        ),
        React.createElement('span', null, `bookmarked:${[...bookmarkedAyahs].sort((a, b) => a - b).join(',')}`),
        React.createElement('span', null, `note:${notesByAyah?.get(255) ?? 'none'}`),
        React.createElement('button', { onClick: () => onEditNote?.(255) }, 'edit note'),
        React.createElement('button', { onClick: () => onToggleBookmark(255) }, 'bookmark'),
        React.createElement('button', { onClick: () => onToggleBookmark(257) }, 'bookmark other'),
        React.createElement('button', { onClick: () => onReadingAyah?.(256) }, 'read ayah'),
        React.createElement('button', { onClick: () => void loadWords(8) }, 'open word sheet'),
      );
    },
  };
});

vi.mock('@/components/NoteEditor', async () => {
  const React = await import('react');
  return {
    // The sheet itself reaches reanimated and gesture-handler, which do not
    // parse under this transform; BookmarksTab.test.tsx covers its behaviour.
    // What matters here is that the route opens it for the right ayah and
    // hands what is typed to the write.
    NoteEditor: ({ surahId, ayahNumber, note, error, onSave }: { surahId: number; ayahNumber: number; note: string | null; error?: string | null; onSave: (note: string) => void }) =>
      React.createElement(
        'div',
        null,
        React.createElement('span', null, `editing:${ayahNumber}:${note ?? 'none'}`),
        React.createElement('span', null, `sheet-surah:${surahId}`),
        React.createElement('span', null, `sheet-error:${error ?? 'none'}`),
        React.createElement('button', { onClick: () => onSave('  the throne verse  ') }, 'save note'),
      ),
  };
});

vi.mock('@/data/openCorpusDb', () => ({
  openCorpusDb: async () => ({}),
}));

vi.mock('@/data/userDb', () => ({
  openUserDb: async () => ({}),
}));

const readerFixture = {
    surah: { id: 2, name_arabic: 'البقرة', name_translit: 'Al-Baqarah', name_translation: 'The Cow', ayah_count: 286 },
    ayahs: [
      {
        ayah: { id: 8, surah_id: 2, ayah_number: 255, text_uthmani: 'الله لا إله إلا هو' },
        translation: { ayah_id: 8, language: 'en', translator: 'Saheeh International', text: 'Allah - there is no deity except Him' },
      },
    ],
};

vi.mock('@/data/corpusRepository', () => ({
  getSurahReader: (...args: unknown[]) => mocks.getSurahReader(...args),
  getWordsForAyah: (...args: unknown[]) => mocks.getWordsForAyah(...args),
}));

vi.mock('@/data/userRepository', () => ({
  getBookmarks: (...args: unknown[]) => mocks.getBookmarks(...args),
  setBookmarkNote: (...args: unknown[]) => mocks.setBookmarkNote(...args),
  setBookmark: (...args: unknown[]) => mocks.setBookmark(...args),
  recordReadingPosition: (...args: unknown[]) => mocks.recordReadingPosition(...args),
  recordReadingDay: (...args: unknown[]) => mocks.recordReadingDay(...args),
}));

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({
    contentLanguage: 'en',
    setContentLanguage: vi.fn(),
    uiLocale: mocks.uiLocale,
    // The reader reads continuous play from the settings store now rather than
    // from the recitation hook's own state (M6i).
    continuousPlay: false,
    setContinuousPlay: mocks.setContinuousPlay,
  }),
}));

vi.mock('react-native', async () => {
  const React = await import('react');
  return {
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
    Text: ({ children }: { children?: React.ReactNode }) => React.createElement('span', null, children),
    View: ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children),
    // Reached since the route pages between surahs: useEntryPager asks
    // useReducedMotion which way the page turn should travel, and that reads
    // the OS flag.
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: () => ({ remove: () => {} }),
    },
    // Recorded rather than auto-answered: the confirm before a note is deleted
    // has to be shown to have been asked, and each test drives whichever
    // button it is about. Auto-resolving here would make "was it asked at all"
    // untestable.
    Alert: {
      alert: (
        title: string,
        body: string,
        buttons: { text: string; onPress?: () => void }[],
      ) => {
        mocks.alerts.push({ title, body, buttons });
      },
    },
  };
});

// The page turn is a layout animation on a view that wraps the whole reader.
// The real package's JS entry pulls in a worklets runtime jsdom has no
// counterpart for; nothing here asserts on the animation, only that the reader
// still renders inside it.
vi.mock('react-native-reanimated', async () => {
  const React = await import('react');
  const View = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);
  return {
    default: { View, createAnimatedComponent: (Component: unknown) => Component },
    FadeIn: { duration: () => ({}) },
    FadeOut: { duration: () => ({}) },
    SlideInLeft: { duration: () => ({}) },
    SlideInRight: { duration: () => ({}) },
    SlideOutLeft: { duration: () => ({}) },
    SlideOutRight: { duration: () => ({}) },
  };
});

describe('SurahRoute', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mocks.setBookmark.mockReset();
    mocks.recordReadingPosition.mockReset();
    mocks.recordReadingDay.mockReset();
    mocks.uiLocale = 'en';
    mocks.getSurahReader.mockReset();
    mocks.getSurahReader.mockResolvedValue(readerFixture);
    mocks.getWordsForAyah.mockReset();
    mocks.getWordsForAyah.mockResolvedValue([]);
    mocks.getBookmarks.mockReset();
    mocks.getBookmarks.mockResolvedValue([]);
    mocks.setBookmarkNote.mockReset();
    mocks.params = { surahId: '2' };
    mocks.pageSurahProps.length = 0;
    mocks.alerts.length = 0;
  });

  it('opens the note editor for the ayah the reader asked about', async () => {
    mocks.getBookmarks.mockResolvedValue([
      { surahId: 2, ayahNumber: 255, note: 'throne', createdAt: '2026-08-29T00:00:00Z' },
      // A different surah's bookmark must not reach this reader's map.
      { surahId: 3, ayahNumber: 5, note: 'elsewhere', createdAt: '2026-08-29T00:00:00Z' },
    ]);

    render(<SurahRoute />);
    expect(await screen.findByText('note:throne')).toBeTruthy();
    // 3:5 must not reach this reader. Unfiltered it arrives as ayah 5 of THIS
    // surah -- a bookmark on an ayah the reader never marked, with someone
    // else's note hanging off it.
    expect(screen.getByText('bookmarked:255')).toBeTruthy();

    fireEvent.click(screen.getByText('edit note'));
    expect(screen.getByText('editing:255:throne')).toBeTruthy();
  });

  it('hands the typed note to the write and shows back what was stored', async () => {
    mocks.getBookmarks.mockResolvedValue([
      { surahId: 2, ayahNumber: 255, note: null, createdAt: '2026-08-29T00:00:00Z' },
    ]);

    render(<SurahRoute />);
    await screen.findByText('note:none');
    fireEvent.click(screen.getByText('edit note'));

    mocks.getBookmarks.mockResolvedValue([
      { surahId: 2, ayahNumber: 255, note: 'the throne verse', createdAt: '2026-08-29T00:00:00Z' },
    ]);
    fireEvent.click(screen.getByText('save note'));

    // The padding the editor sent is gone, because the row is re-read after the
    // write rather than assumed -- normalizeNote decides what is stored.
    expect(await screen.findByText('note:the throne verse')).toBeTruthy();
    expect(mocks.setBookmarkNote).toHaveBeenCalledWith(expect.anything(), 2, 255, '  the throne verse  ');
  });

  it('asks before deleting a bookmark that carries a note', async () => {
    mocks.getBookmarks.mockResolvedValue([
      { surahId: 2, ayahNumber: 255, note: 'throne', createdAt: '2026-08-29T00:00:00Z' },
    ]);

    render(<SurahRoute />);
    await screen.findByText('note:throne');
    fireEvent.click(screen.getByText('bookmark'));

    // Nothing has been written or removed yet: the question comes first, so
    // cancelling costs nothing.
    await waitFor(() => expect(mocks.alerts).toHaveLength(1));
    expect(mocks.setBookmark).not.toHaveBeenCalled();
    expect(screen.getByText('bookmarked:255')).toBeTruthy();

    const confirm = mocks.alerts[0]?.buttons.find((button) => button.text === 'Delete');
    await act(async () => {
      confirm?.onPress?.();
    });

    await waitFor(() =>
      expect(mocks.setBookmark).toHaveBeenCalledWith(expect.anything(), 2, 255, false),
    );
  });

  it('leaves the bookmark and its note alone when the confirm is cancelled', async () => {
    mocks.getBookmarks.mockResolvedValue([
      { surahId: 2, ayahNumber: 255, note: 'throne', createdAt: '2026-08-29T00:00:00Z' },
    ]);

    render(<SurahRoute />);
    await screen.findByText('note:throne');
    fireEvent.click(screen.getByText('bookmark'));
    await waitFor(() => expect(mocks.alerts).toHaveLength(1));

    const cancel = mocks.alerts[0]?.buttons.find((button) => button.text === 'Cancel');
    await act(async () => {
      cancel?.onPress?.();
    });

    expect(mocks.setBookmark).not.toHaveBeenCalled();
    expect(screen.getByText('bookmarked:255')).toBeTruthy();
    expect(screen.getByText('note:throne')).toBeTruthy();
  });

  it('does not ask when the bookmark being removed has no note', async () => {
    mocks.getBookmarks.mockResolvedValue([
      { surahId: 2, ayahNumber: 255, note: null, createdAt: '2026-08-29T00:00:00Z' },
    ]);

    render(<SurahRoute />);
    await screen.findByText('note:none');
    fireEvent.click(screen.getByText('bookmark'));

    // A dialog on every un-bookmark would be an interruption on the common
    // path; there is nothing to lose when the row carries no text.
    await waitFor(() =>
      expect(mocks.setBookmark).toHaveBeenCalledWith(expect.anything(), 2, 255, false),
    );
    expect(mocks.alerts).toHaveLength(0);
  });

  it('restores the note, not an empty one, when the delete write fails', async () => {
    mocks.getBookmarks.mockResolvedValue([
      { surahId: 2, ayahNumber: 255, note: 'throne', createdAt: '2026-08-29T00:00:00Z' },
    ]);
    mocks.setBookmark.mockRejectedValue(new Error('bookmark write boom'));

    render(<SurahRoute />);
    await screen.findByText('note:throne');
    fireEvent.click(screen.getByText('bookmark'));
    await waitFor(() => expect(mocks.alerts).toHaveLength(1));
    await act(async () => {
      mocks.alerts[0]?.buttons.find((button) => button.text === 'Delete')?.onPress?.();
    });

    // The DELETE failed, so the row and its note are still in SQLite. Coming
    // back as an empty note would have the editor seed a blank draft over text
    // that was never lost.
    await waitFor(() => expect(screen.getByText('Unable to update bookmark')).toBeTruthy());
    expect(screen.getByText('bookmarked:255')).toBeTruthy();
    expect(screen.getByText('note:throne')).toBeTruthy();
  });

  it('shows a failed note write inside the sheet, not on the reader behind it', async () => {
    mocks.getBookmarks.mockResolvedValue([
      { surahId: 2, ayahNumber: 255, note: null, createdAt: '2026-08-29T00:00:00Z' },
    ]);
    mocks.setBookmarkNote.mockRejectedValue(new Error('note write boom'));

    render(<SurahRoute />);
    await screen.findByText('note:none');
    fireEvent.click(screen.getByText('edit note'));
    fireEvent.click(screen.getByText('save note'));

    // The sheet is a <Modal> in its own native window: an alert rendered on the
    // reader is drawn behind it and announced to nobody.
    await waitFor(() =>
      expect(screen.getByText('sheet-error:Unable to save the note')).toBeTruthy(),
    );
    expect(screen.queryByText('Unable to save the note')).toBeNull();
  });

  it('closes the note sheet when the reader pages to another surah', async () => {
    mocks.getBookmarks.mockResolvedValue([
      { surahId: 2, ayahNumber: 255, note: 'throne', createdAt: '2026-08-29T00:00:00Z' },
    ]);

    render(<SurahRoute />);
    await screen.findByText('note:throne');
    fireEvent.click(screen.getByText('edit note'));
    expect(screen.getByText('editing:255:throne')).toBeTruthy();

    // The sheet is state, not navigation, so it survives a page turn unless the
    // route clears it -- left open it edits an ayah number against the surah
    // the reader has already left.
    await act(async () => {
      fireEvent.click(screen.getByText('page next'));
    });

    // Matched on the sheet existing at all, not on its text. Asserting
    // `editing:255:throne` is gone passes with the sheet still mounted: the new
    // surah's bookmark map has no 255, so it re-renders as `editing:255:none`
    // and the assertion succeeds while the bug is fully present.
    expect(screen.queryByText(/^editing:/)).toBeNull();
  });

  it('writes a note against the surah on screen, not the one being paged to', async () => {
    mocks.getBookmarks.mockResolvedValue([
      { surahId: 2, ayahNumber: 255, note: null, createdAt: '2026-08-29T00:00:00Z' },
    ]);

    render(<SurahRoute />);
    await screen.findByText('note:none');

    // Mid page turn the outgoing surah is still mounted and still interactive,
    // so `surahId` is already 3 while the reader shows 2. A note saved here
    // belongs to 2:255; against 3 it lands on another surah's bookmark, or
    // throws on an ayah number surah 3 does not reach.
    const pending = deferred<typeof readerFixture>();
    mocks.getSurahReader.mockReturnValue(pending.promise);
    fireEvent.click(screen.getByText('page next'));
    await waitFor(() =>
      expect(mocks.getSurahReader).toHaveBeenLastCalledWith(expect.anything(), 3, 'en'),
    );

    // Opened DURING the turn, which is what makes this reachable: the held
    // reader is on screen with its pen, so the sheet can be opened after
    // `surahId` has already moved on.
    fireEvent.click(screen.getByText('edit note'));
    expect(screen.getByText('sheet-surah:2')).toBeTruthy();
    fireEvent.click(screen.getByText('save note'));

    await waitFor(() =>
      expect(mocks.setBookmarkNote).toHaveBeenCalledWith(expect.anything(), 2, 255, '  the throne verse  '),
    );

    await act(async () => {
      pending.resolve(readerFixture);
    });
  });

  it('offers the surah either side, and neither past the ends of the mushaf', async () => {
    render(<SurahRoute />);
    expect(await screen.findByText('adjacent:1/3')).toBeTruthy();

    cleanup();
    mocks.params = { surahId: '1' };
    render(<SurahRoute />);
    expect(await screen.findByText('adjacent:none/2')).toBeTruthy();

    cleanup();
    mocks.params = { surahId: '114' };
    render(<SurahRoute />);
    // D47: no wrapping. 115 is not a surah, and an arrow offering it would
    // open a reader that can only fail to load.
    expect(await screen.findByText('adjacent:113/none')).toBeTruthy();
  });

  it('pages to the next surah without navigating', async () => {
    render(<SurahRoute />);
    await screen.findByText('reader-content');

    fireEvent.click(screen.getByText('page next'));

    // The surah changes in place (D48): a new load, no push. Pushing would
    // grow the back stack, so leaving five surahs later would take five
    // presses.
    await waitFor(() =>
      expect(mocks.getSurahReader).toHaveBeenLastCalledWith(expect.anything(), 3, 'en'),
    );
    expect(await screen.findByText('adjacent:2/4')).toBeTruthy();
  });

  it('does not carry the opened ayah into the surah it pages to', async () => {
    mocks.params = { surahId: '2', ayah: '50' };
    render(<SurahRoute />);
    expect(await screen.findByText('anchor:50')).toBeTruthy();

    fireEvent.click(screen.getByText('page next'));
    await waitFor(() =>
      expect(mocks.getSurahReader).toHaveBeenLastCalledWith(expect.anything(), 3, 'en'),
    );

    // Paging is state, so ?ayah= does not change with the surah. Handed on, a
    // bookmark that opened Al-Baqarah at 2:50 landed Aal-Imran on 3:50.
    expect(await screen.findByText('anchor:none')).toBeTruthy();
  });

  it('keeps the outgoing surah on screen while the next one loads', async () => {
    render(<SurahRoute />);
    await screen.findByText('reader-content');

    const pending = deferred<typeof readerFixture>();
    mocks.getSurahReader.mockReturnValue(pending.promise);
    fireEvent.click(screen.getByText('page next'));
    await waitFor(() =>
      expect(mocks.getSurahReader).toHaveBeenLastCalledWith(expect.anything(), 3, 'en'),
    );

    // Blanking to the spinner here leaves reanimated no outgoing view, so the
    // page turn is a jump with a spinner in the middle rather than two halves
    // moving together.
    expect(screen.queryByText('loading')).toBeNull();
    expect(screen.getByText('reader-content')).toBeTruthy();

    await act(async () => {
      pending.resolve(readerFixture);
    });
  });

  it('hands the reader a page-turn callback that survives a re-render', async () => {
    const { rerender } = render(<SurahRoute />);
    await screen.findByText('reader-content');
    const first = mocks.pageSurahProps.at(-1);

    rerender(<SurahRoute />);
    await screen.findByText('reader-content');

    // A fresh closure per render re-runs the effect that publishes the header,
    // and this route re-renders several times a second while audio plays.
    expect(mocks.pageSurahProps.at(-1)).toBe(first);
  });

  it('retranslates a load failure when the UI language changes', async () => {
    mocks.getSurahReader.mockRejectedValue(new Error('no such table: ayahs'));

    const { rerender } = render(<SurahRoute />);
    await screen.findByText('Unable to load surah');

    // The effect stores a string already translated with the locale it
    // captured, so it has to rerun when that locale changes -- otherwise the
    // failure stays in the previous language for as long as it is on screen.
    mocks.uiLocale = 'uz';
    rerender(<SurahRoute />);

    await waitFor(() => expect(screen.getByText('Surani yuklab bo\u2018lmadi')).toBeTruthy());
  });

  it('keeps the reader visible when bookmark persistence fails', async () => {
    mocks.setBookmark.mockRejectedValue(new Error('bookmark write boom'));
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('bookmark'));

    await waitFor(() => expect(screen.getByText('Unable to update bookmark')).toBeTruthy());
    expect(screen.getByText('reader-content')).toBeTruthy();
  });

  it('reverts only the failed ayah when another bookmark lands mid-write', async () => {
    const failingWrite = deferred<void>();
    mocks.setBookmark.mockImplementation((_client: unknown, _surahId: number, ayahNumber: number) =>
      ayahNumber === 255 ? failingWrite.promise : Promise.resolve(),
    );
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('bookmark'));
    fireEvent.click(screen.getByText('bookmark other'));
    await waitFor(() => expect(screen.getByText('bookmarked:255,257')).toBeTruthy());

    failingWrite.reject(new Error('bookmark write boom'));

    // 257 is committed in SQLite. Restoring a set snapshotted before 255's
    // write would drop it from the list too, and the reader would disagree
    // with the DB until the next focus reload.
    await waitFor(() => expect(screen.getByText('Unable to update bookmark')).toBeTruthy());
    expect(screen.getByText('bookmarked:257')).toBeTruthy();
  });

  it('keeps the reader visible when reading history persistence fails', async () => {
    mocks.recordReadingPosition.mockRejectedValue(new Error('reading position write boom'));
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('read ayah'));

    await waitFor(() => expect(screen.getByText('Unable to save reading position')).toBeTruthy());
    expect(screen.getByText('reader-content')).toBeTruthy();
  });

  it('records the local day on the same write as the reading position', async () => {
    // Decision 22: any reading counts. The position write already fires on the
    // reader's scroll, so it is the one place that sees every read without a
    // second listener to keep in step.
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('read ayah'));

    await waitFor(() => expect(mocks.recordReadingDay).toHaveBeenCalled());
    // Computed here rather than hard-coded: the assertion is that the day is
    // the device's local one, and localDay is the thing under test elsewhere.
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    expect(mocks.recordReadingDay.mock.calls[0]?.[1]).toBe(today);
  });

  it('does not report a position failure when only the reading-day write throws', async () => {
    // The streak is a nicety; losing the reading position is what the user
    // notices. A rejected day insert must not surface as "position not saved"
    // for a position that was in fact saved.
    mocks.recordReadingDay.mockRejectedValue(new Error('disk full'));
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('read ayah'));

    await waitFor(() => expect(mocks.recordReadingDay).toHaveBeenCalled());
    expect(mocks.recordReadingPosition).toHaveBeenCalledWith({}, 2, 256);
    expect(screen.queryByText('Unable to save reading position')).toBeNull();
  });

  it('keeps a bookmark failure on screen while background reading writes run', async () => {
    const readingWrite = deferred<void>();
    mocks.setBookmark.mockRejectedValue(new Error('bookmark write boom'));
    mocks.recordReadingPosition.mockReturnValue(readingWrite.promise);
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('bookmark'));
    await waitFor(() => expect(screen.getByText('Unable to update bookmark')).toBeTruthy());

    // Scrolling drives this write, so it must not clear feedback the user never
    // acknowledged -- their bookmark is still unsaved.
    fireEvent.click(screen.getByText('read ayah'));
    await waitFor(() => expect(mocks.recordReadingPosition).toHaveBeenCalled());
    expect(screen.getByText('Unable to update bookmark')).toBeTruthy();

    await act(async () => {
      readingWrite.resolve();
      await readingWrite.promise;
    });

    expect(screen.getByText('Unable to update bookmark')).toBeTruthy();
    expect(screen.getByText('reader-content')).toBeTruthy();
  });

  it('surfaces bookmark and reading failures independently', async () => {
    mocks.setBookmark.mockRejectedValue(new Error('bookmark write boom'));
    mocks.recordReadingPosition.mockRejectedValue(new Error('reading position write boom'));
    render(<SurahRoute />);

    await screen.findByText('reader-content');
    fireEvent.click(screen.getByText('bookmark'));
    await waitFor(() => expect(screen.getByText('Unable to update bookmark')).toBeTruthy());

    fireEvent.click(screen.getByText('read ayah'));
    await waitFor(() => expect(screen.getByText('Unable to save reading position')).toBeTruthy());
    expect(screen.getByText('Unable to update bookmark')).toBeTruthy();
  });

  it('loads a tapped ayah\'s words through the corpus client it opened', async () => {
    render(<SurahRoute />);
    await screen.findByText('reader-content');

    fireEvent.click(screen.getByText('open word sheet'));

    // The client, not undefined: `loadWords` closes over the client the reader
    // effect opened, and a route that hands the sheet a loader with no client
    // returns an empty word list on every tap -- an ayah that opens to nothing.
    await waitFor(() => expect(mocks.getWordsForAyah).toHaveBeenCalledWith({}, 8));
  });
});
