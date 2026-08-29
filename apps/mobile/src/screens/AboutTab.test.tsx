import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RECITERS } from '@quran-corpus/data/mobile';
import { selectedTranslators } from '@quran-corpus/mobile-data';
import AboutTab from '../../app/about';

vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en' }),
}));

vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.2.3' } },
}));

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

describe('AboutTab', () => {
  afterEach(cleanup);

  it('names every audio source the app can play', () => {
    render(<AboutTab />);

    // Read off RECITERS rather than a list typed here, so this fails the day a
    // reciter is added to the shared table and not to the screen -- which is a
    // licence problem, not a copy problem (CLAUDE.md §11).
    const credits = screen.getByTestId('reciter-credits').textContent ?? '';
    for (const reciter of RECITERS) {
      expect(credits, `missing ${reciter.id}`).toContain(reciter.label);
    }
    // The list is the whole set, not a prefix of it: an implementation that
    // rendered RECITERS.slice(0, 3) would satisfy a loop over three names.
    expect(screen.getByTestId('reciter-credits').children).toHaveLength(RECITERS.length);
  });

  it('credits the translators the bundled DB actually carries', () => {
    render(<AboutTab />);

    // Same rule as the reciters above: the name is read from the shared table
    // create-m1-reader-db.ts validates the DB against, so swapping a translator
    // cannot leave this screen crediting the previous one (§11).
    for (const [language, translator] of Object.entries(selectedTranslators)) {
      expect(screen.getByText(translator), `missing ${language}`).toBeTruthy();
    }
  });

  it('carries the OFL notice for the display face', () => {
    render(<AboutTab />);

    // The licence requires the notice; it is not decoration, and it is the one
    // credit on this screen that is legally load-bearing today.
    expect(screen.getByText(/SIL Open Font License 1\.1/)).toBeTruthy();
    expect(screen.getByText(/Copyright 2020 The Newsreader Project Authors/)).toBeTruthy();
  });

  it('credits every source group', () => {
    render(<AboutTab />);

    for (const name of [
      'Tanzil',
      'corpus.quran.com',
      'Saheeh International',
      "Lane's Lexicon",
      'Hans Wehr',
      'everyayah.com',
      'Hafs',
    ]) {
      expect(screen.getByText(name), `missing ${name}`).toBeTruthy();
    }
  });

  it('marks an uncleared licence as uncleared, and leaves a cleared one unmarked', () => {
    render(<AboutTab />);

    // Both directions: a screen that pilled everything would pass a
    // presence-only check while saying nothing.
    expect(screen.getByTestId('pending-Hans Wehr').textContent).toBe('Source approval incomplete');
    expect(screen.queryByTestId('pending-corpus.quran.com')).toBeNull();
    expect(screen.queryByTestId('pending-Newsreader')).toBeNull();
  });

  it('reads the version from the app config', () => {
    render(<AboutTab />);

    expect(screen.getByTestId('app-version').textContent).toBe('Quran Corpus 1.2.3');
  });
});
