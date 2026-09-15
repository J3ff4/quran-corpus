import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  track: null as { owner: string } | null,
  ayah: null as number | null,
  playing: false,
  toggle: vi.fn(),
  /** The saved setting. Ruling 9 says this card ignores it. */
  continuousPlay: false,
}));

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
vi.mock('react-native-gesture-handler', async () =>
  (await import('@/testing/rnHosts.js')).reactNativeGestureHandlerMock(),
);
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({
    uiLocale: 'en',
    reciterId: 'husary',
    continuousPlay: mocks.continuousPlay,
    reduceMotion: false,
  }),
}));
vi.mock('@/audio/recitationContext', () => ({
  useRecitationController: () => ({
    track: mocks.track,
    ayah: mocks.ayah,
    playing: mocks.playing,
    positionSec: 3,
    durationSec: 30,
    finished: false,
    continuous: false,
    error: null,
    toggle: mocks.toggle,
    stop: vi.fn(),
    seekTo: vi.fn(),
    skipNext: vi.fn(),
    skipPrevious: vi.fn(),
  }),
}));

import { HomePlayerCard } from './HomePlayerCard';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';
import type { ReaderLocation } from '@/data/corpusRepository';

/** Al-Baqarah, loaded. 286 is what stops continuous play at its end. */
const LOCATION = {
  surah: { id: 2, name_translit: 'Al-Baqarah', ayah_count: 286 },
} as unknown as ReaderLocation;

function renderCard(location: ReaderLocation | null = LOCATION) {
  render(
    <ThemeContext.Provider value={themeColors.dark}>
      <HomePlayerCard
        surahId={2}
        ayahNumber={255}
        location={location}
        reciterId="husary"
        uiLocale="en"
      />
    </ThemeContext.Provider>,
  );
}

beforeEach(() => {
  mocks.track = null;
  mocks.ayah = null;
  mocks.playing = false;
  mocks.continuousPlay = false;
  mocks.toggle.mockReset();
});

afterEach(cleanup);

describe('HomePlayerCard', () => {
  it('rests as one line naming the reciter', () => {
    renderCard();

    expect(screen.getByText(/Listen · Mahmoud/)).toBeTruthy();
    expect(screen.getByLabelText('Play 2:255')).toBeTruthy();
  });

  it('starts the ayah the reading stopped on', () => {
    renderCard();

    fireEvent.click(screen.getByLabelText('Play 2:255'));

    expect(mocks.toggle).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'home', surahId: 2, ayahCount: 286 }),
      255,
    );
  });

  it('runs on through the surah even with Continuous play switched OFF', () => {
    // Ruling 9. The setting exists for the reader, where play is a per-ayah
    // control sitting on that ayah's own card and "just this one" is a coherent
    // request. This is a resume-listening control.
    mocks.continuousPlay = false;
    renderCard();

    fireEvent.click(screen.getByLabelText('Play 2:255'));

    expect(mocks.toggle).toHaveBeenCalledWith(
      expect.objectContaining({ continuous: true }),
      255,
    );
  });

  it('waits for the surah to load before it will start anything', () => {
    // ayahCount is what stops continuous play at the end of the surah. Starting
    // without it would run a recitation with nowhere to stop.
    renderCard(null);

    const play = screen.getByLabelText('Play 2:255');
    expect(play.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(play);

    expect(mocks.toggle).not.toHaveBeenCalled();
  });

  it('will not restart a track whose surah has gone missing under it', () => {
    // The expanded bar's play control has no disabled state -- it is a Pause
    // while the ayah sounds. If the corpus read fails while it is playing, the
    // count that stops continuous play is gone, and resuming would run a
    // recitation with nowhere to stop. The guard inside the handler is the
    // only thing standing there.
    mocks.track = { owner: 'home' };
    mocks.ayah = 255;
    mocks.playing = true;
    renderCard(null);

    fireEvent.click(screen.getByLabelText('Pause'));

    expect(mocks.toggle).not.toHaveBeenCalled();
  });

  it('grows into the full transport while it is the one sounding', () => {
    mocks.track = { owner: 'home' };
    mocks.ayah = 255;
    mocks.playing = true;

    renderCard();

    expect(screen.getByTestId('recitation-bar')).toBeTruthy();
    expect(screen.queryByLabelText('Play 2:255')).toBeNull();
  });

  it('stays a resting line while the sound belongs to another screen', () => {
    // A reader-owned recitation is audible here. This card is Home's own
    // control, not a mirror of whatever is playing -- and the mini-player is
    // suppressed on this tab, which is deliberate: the reader is one tap away
    // and owns its own bar.
    mocks.track = { owner: 'reader' };
    mocks.ayah = 255;
    mocks.playing = true;

    renderCard();

    expect(screen.queryByTestId('recitation-bar')).toBeNull();
    expect(screen.getByLabelText('Play 2:255')).toBeTruthy();
  });
});

describe('HomePlayerCard, once it has run past where it started', () => {
  it('pauses the ayah that is sounding, not the one the reading stopped on', () => {
    // Continuous play walks past ayah 255. Passing the PROP here would miss
    // the playhead, fall through to a fresh start and jump the recitation
    // backwards on the one control meant to hold it still.
    mocks.track = { owner: 'home' };
    mocks.ayah = 257;
    mocks.playing = true;

    renderCard();

    fireEvent.click(screen.getByLabelText('Pause'));

    expect(mocks.toggle).toHaveBeenCalledWith(expect.objectContaining({ owner: 'home' }), 257);
  });
});
