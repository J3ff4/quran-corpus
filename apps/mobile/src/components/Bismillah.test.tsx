import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bismillah } from './Bismillah';

// Bismillah renders a bare <Text>, so it needs the same DOM host mapping
// every other component test gives 'react-native' -- the real package is
// Flow-typed and fails to parse under jsdom/vitest.
vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');

  return {
    Text: host('span'),
  };
});

describe('Bismillah', () => {
  // This suite renders more than once via it.each and the project does not
  // enable testing-library's global auto-cleanup, so without this each case
  // queries the leftover DOM of the previous one (see AyahCard.test.tsx).
  afterEach(cleanup);

  it('renders the banner for a normal surah', () => {
    render(<Bismillah surahId={96} />);
    expect(screen.getByTestId('bismillah')).toBeTruthy();
  });

  it.each([
    [1, 'al-Fatiha, where the basmala is ayah 1 itself'],
    [9, 'at-Tawba, which has none'],
  ])('renders nothing for surah %i (%s)', (surahId) => {
    render(<Bismillah surahId={surahId} />);
    expect(screen.queryByTestId('bismillah')).toBeNull();
  });
});
