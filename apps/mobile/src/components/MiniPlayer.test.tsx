import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  segments: ['(tabs)', 'surahs'] as string[],
  track: null as { owner: string; surahId: number } | null,
  ayah: null as number | null,
  playing: false,
  toggle: vi.fn(),
  stop: vi.fn(),
}));

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
vi.mock('react-native-gesture-handler', async () =>
  (await import('@/testing/rnHosts.js')).reactNativeGestureHandlerMock(),
);
vi.mock('expo-router', () => ({ useSegments: () => mocks.segments }));
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
  mocks.track = { owner: 'reader', surahId: 2 };
  mocks.ayah = 255;
  mocks.playing = true;
}

beforeEach(() => {
  mocks.segments = ['(tabs)', 'surahs'];
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
    expect(screen.getByText('Ayah 255')).toBeTruthy();
  });

  it('is not there at all when nothing is sounding', () => {
    // Not parked with a Play on it: there is nothing on these screens the bar
    // belongs to, so a resting one is furniture on five tabs for a recitation
    // that stopped.
    renderMini();

    expect(screen.queryByTestId('mini-player')).toBeNull();
  });

  it('stays away while the sound is only paused', () => {
    mocks.track = { owner: 'reader', surahId: 2 };
    mocks.ayah = 255;
    mocks.playing = false;

    renderMini();

    expect(screen.queryByTestId('mini-player')).toBeNull();
  });

  it('leaves the mushaf to its own player', () => {
    sounding();
    mocks.segments = ['(tabs)', 'mushaf'];

    renderMini();

    expect(screen.queryByTestId('mini-player')).toBeNull();
  });

  it('leaves Home to its card, which grows in place', () => {
    // Ruling 8. Two transports on one screen is two answers to the question of
    // what is playing.
    sounding();
    mocks.segments = ['(tabs)', 'index'];

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

    expect(mocks.toggle).toHaveBeenCalledWith({ owner: 'reader', surahId: 2 }, 255);
  });
});
