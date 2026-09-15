import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reciterId: 'husary' }));

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
// expo-audio is a native module: its JS entry reaches for __DEV__ and for
// ExpoAudio through expo-modules-core, neither of which exists under jsdom.
// Every driver in this suite is a fake passed in, so nothing here needs the
// real one to do anything.
vi.mock('expo-audio', () => ({
  createAudioPlayer: vi.fn(),
  setAudioModeAsync: vi.fn(async () => undefined),
  preload: vi.fn(async () => undefined),
  clearPreloadedSource: vi.fn(async () => undefined),
  clearAllPreloadedSources: vi.fn(async () => undefined),
}));
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ reciterId: mocks.reciterId }),
}));

import { ayahAudioUrl } from '@quran-corpus/data/mobile';

import {
  RecitationProvider,
  useRecitationController,
  type RecitationController,
  type TrackContext,
} from './recitationContext';
import type { RecitationStatus } from './ayahAudio';

function fakeDriver() {
  const recorder = {
    created: [] as string[],
    replaced: [] as string[],
    pauses: 0,
    create(url: string, _onStatus: (status: RecitationStatus) => void) {
      recorder.created.push(url);
      return {
        play: () => undefined,
        pause: () => {
          recorder.pauses += 1;
        },
        replace: (next: string) => recorder.replaced.push(next),
        seekTo: () => undefined,
        preload: () => undefined,
        clearPreload: () => undefined,
        setLockScreen: () => undefined,
        destroy: () => undefined,
      };
    },
  };
  return recorder;
}

const READER: TrackContext = {
  owner: 'reader',
  surahId: 2,
  ayahCount: 286,
  surahName: 'Al-Baqarah',
  continuous: false,
};

const MUSHAF: TrackContext = {
  owner: 'mushaf',
  surahId: 5,
  ayahCount: 120,
  surahName: 'Al-Maidah',
  continuous: true,
};

/** Two consumers, so the test can prove they see one engine and not two. */
function renderApp(driver = fakeDriver()) {
  const seen: { a: RecitationController | null; b: RecitationController | null } = {
    a: null,
    b: null,
  };
  function Consumer({ slot }: { slot: 'a' | 'b' }) {
    const audio = useRecitationController();
    seen[slot] = audio;
    return <div data-testid={`owner-${slot}`}>{audio.track?.owner ?? 'none'}</div>;
  }
  render(
    <RecitationProvider createDriver={driver.create}>
      <Consumer slot="a" />
      <Consumer slot="b" />
    </RecitationProvider>,
  );
  return {
    driver,
    a: () => seen.a as RecitationController,
    b: () => seen.b as RecitationController,
    owner: (slot: 'a' | 'b') => screen.getByTestId(`owner-${slot}`).textContent,
  };
}

afterEach(() => {
  cleanup();
  mocks.reciterId = 'husary';
});

describe('RecitationProvider', () => {
  it('records who started what is sounding', () => {
    const app = renderApp();

    act(() => app.a().toggle(READER, 255));

    expect(app.owner('a')).toBe('reader');
    expect(app.a().ayah).toBe(255);
    expect(app.driver.created).toEqual([ayahAudioUrl(2, 255, 'husary')]);
  });

  it('is one engine, so both consumers see the same playhead', () => {
    // The whole point of the hoist. Two `useRecitation` calls would leave each
    // consumer with its own ayah and its own sound.
    const app = renderApp();

    act(() => app.a().toggle(READER, 255));

    expect(app.b().ayah).toBe(255);
    expect(app.owner('b')).toBe('reader');
  });

  it('hands the track over rather than sounding two at once', () => {
    const app = renderApp();

    act(() => app.a().toggle(READER, 255));
    act(() => app.b().toggle(MUSHAF, 3));

    expect(app.owner('a')).toBe('mushaf');
    expect(app.a().ayah).toBe(3);
    // Replaced on the one player, not a second player created. One voice.
    expect(app.driver.created).toHaveLength(1);
    expect(app.driver.replaced).toEqual([ayahAudioUrl(5, 3, 'husary')]);
  });

  it('starts the right surah on the very tick the track changes', () => {
    // The track is state, so `toggleAyah` runs against the PREVIOUS render's
    // surah. Passing it as the override argument is what keeps 5:3 from being
    // sounded as 2:3 -- both arrive at the hook as the number 3.
    const app = renderApp();

    act(() => app.a().toggle(READER, 3));
    act(() => app.b().toggle(MUSHAF, 3));

    expect(app.driver.replaced).toEqual([ayahAudioUrl(5, 3, 'husary')]);
  });

  it('forgets the track when stopped', () => {
    const app = renderApp();

    act(() => app.a().toggle(READER, 255));
    act(() => app.a().stop());

    expect(app.owner('a')).toBe('none');
    expect(app.a().ayah).toBe(null);
    expect(app.driver.pauses).toBe(1);
  });

  it('refuses to work outside the provider', () => {
    // A null-object controller would render a full transport whose buttons did
    // nothing -- the shape of issue #63. This is a mistake in the tree, and it
    // says so on the first render.
    function Orphan() {
      useRecitationController();
      return null;
    }
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Orphan />)).toThrow(/outside RecitationProvider/);

    quiet.mockRestore();
  });
});
