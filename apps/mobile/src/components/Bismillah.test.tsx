import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bismillah } from './Bismillah';

// Bismillah renders a bare <Text>, so it needs the same DOM host mapping
// every other component test gives 'react-native' -- the real package is
// Flow-typed and fails to parse under jsdom/vitest.
vi.mock('@/settings/settingsStore', () => ({
  // Not a provider: the real store pulls expo-sqlite into the jsdom module
  // graph, and every other component test here mocks it the same way. The
  // step only has to be one useArabicSizes recognises.
  useAppSettings: () => ({ arabicScale: 'medium' }),
}));

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');

  return {
    Text: host('span'),
  };
});

describe('Bismillah', () => {
  // This suite renders more than once and the project does not enable
  // testing-library's global auto-cleanup, so without this each case queries
  // the leftover DOM of the previous one (see AyahCard.test.tsx).
  afterEach(cleanup);

  it('renders the text it is handed', () => {
    render(<Bismillah text="بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ" />);

    expect(screen.getByTestId('bismillah').textContent).toBe('بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ');
  });

  it('renders the spelling of the surah it opens, not a canonical one', () => {
    // 95:1 and 97:1 carry a shadda on the ba. Held as a constant here, the
    // banner would contradict the mushaf text on those two surahs; who decides
    // is splitBasmala, and this asserts the component defers to it.
    render(<Bismillah text="بِّسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ" />);

    expect(screen.getByTestId('bismillah').textContent).toBe('بِّسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ');
  });
});
