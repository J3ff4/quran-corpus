import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pathname: '/surahs',
  track: null as { owner: string; surahId: number; surahName?: string } | null,
  ayah: null as number | null,
  playing: false,
  toggle: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
vi.mock('react-native-gesture-handler', async () =>
  (await import('@/testing/rnHosts.js')).reactNativeGestureHandlerMock(),
);
vi.mock('expo-router', () => ({ usePathname: () => mocks.pathname }));
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', reciterId: 'husary' }),
}));
vi.mock('@/audio/recitationContext', () => ({
  useRecitationController: () => ({
    track: mocks.track,
    ayah: mocks.ayah,
    playing: mocks.playing,
    positionSec: 4,
    durationSec: 30,
    finished: false,
    continuous: false,
    error: null,
    toggle: mocks.toggle,
    stop: mocks.stop,
    seekTo: vi.fn(),
    skipNext: vi.fn(),
    skipPrevious: vi.fn(),
  }),
}));

import { MiniPlayer } from './MiniPlayer';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

function renderMini() {
  render(
    <ThemeContext.Provider value={themeColors.dark}>
      <MiniPlayer />
    </ThemeContext.Provider>,
  );
}

/** Something is sounding, started by the reader. */
function sounding() {
  mocks.track = { owner: 'reader', surahId: 2, surahName: 'Al-Baqarah' };
  mocks.ayah = 255;
  mocks.playing = true;
}

beforeEach(() => {
  mocks.pathname = '/surahs';
  mocks.track = null;
  mocks.ayah = null;
  mocks.playing = false;
  mocks.toggle.mockReset();
  mocks.stop.mockReset();
});

afterEach(cleanup);

describe('MiniPlayer', () => {
  it('docks over a tab that has no player of its own', () => {
    sounding();

    renderMini();

    expect(screen.getByTestId('mini-player')).toBeTruthy();
    // The surah too. This bar docks over tabs that are not the reader's, so
    // the ayah number alone names nothing a reader who walked away can place.
    expect(screen.getByText('Al-Baqarah · Ayah 255')).toBeTruthy();
  });

  it('is not there at all when nothing is sounding', () => {
    // Not parked with a Play on it: there is nothing on these screens the bar
    // belongs to, so a resting one is furniture on five tabs for a recitation
    // that stopped.
    renderMini();

    expect(screen.queryByTestId('mini-player')).toBeNull();
  });

  it('stays put while the sound is only paused', () => {
    // It carries its own Pause, so vanishing on pause would take the only way
    // to resume with it -- and an OS pause would do that unasked.
    mocks.track = { owner: 'reader', surahId: 2 };
    mocks.ayah = 255;
    mocks.playing = false;

    renderMini();

    expect(screen.getByTestId('mini-player')).toBeTruthy();
    expect(screen.getByLabelText('Play')).toBeTruthy();
  });

  it('leaves the mushaf to its own player', () => {
    sounding();
    mocks.pathname = '/mushaf';

    renderMini();

    expect(screen.queryByTestId('mini-player')).toBeNull();
  });

  it('leaves Home to its card, which grows in place', () => {
    // Ruling 8. Two transports on one screen is two answers to the question of
    // what is playing.
    sounding();
    // The real value expo-router reports on Home: it pops a trailing `index`
    // segment, so anything matching on the SEGMENT never fired here and the
    // bar docked on top of Home's own card.
    mocks.pathname = '/';

    renderMini();

    expect(screen.queryByTestId('mini-player')).toBeNull();
  });

  it('stops the recitation from its X', () => {
    sounding();
    renderMini();

    fireEvent.click(screen.getByLabelText('Stop recitation'));

    expect(mocks.stop).toHaveBeenCalled();
  });

  it('resumes the track it is showing, not some default', () => {
    sounding();
    renderMini();

    fireEvent.click(screen.getByLabelText('Pause'));

    expect(mocks.toggle).toHaveBeenCalledWith(
      { owner: 'reader', surahId: 2, surahName: 'Al-Baqarah' },
      255,
    );
  });
});
