import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MEDALLION_OUTLINE_PATH } from '@quran-corpus/config/ornaments/medallion';
import { AyahMedallion } from './AyahMedallion';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');

  return {
    Text: host('span'),
    View: host('div'),
    useWindowDimensions: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }),
  };
});

describe('AyahMedallion', () => {
  afterEach(cleanup);

  it('announces the ayah it marks', () => {
    render(<AyahMedallion n={255} uiLocale="en" />);

    // Queried by label, not by role: RN's accessibilityRole is "image", which
    // the mock passes straight through to a DOM role of "image" -- not the
    // ARIA "img" role, so getByRole('img') would not find it.
    //
    // Without this the rosette is decorative art with a loose digit beside it
    // and TalkBack reads "255" with no idea what it counts.
    expect(screen.getByLabelText('Ayah 255')).toBeTruthy();
  });

  it('announces it in the reader locale, not always English', () => {
    render(<AyahMedallion n={255} uiLocale="ru" />);

    // The label replaced a bare digit, which TalkBack read in the user's own
    // language. A hardcoded English label would make every verse in the surah
    // announce "Ayah" to a Russian reader -- worse than the digit it replaced.
    expect(screen.getByLabelText('Аят 255')).toBeTruthy();
  });

  it('draws the number inside the rosette', () => {
    render(<AyahMedallion n={7} uiLocale="en" />);

    expect(screen.getByText('7')).toBeTruthy();
  });

  it('shrinks only three-digit numbers so they clear the rosette border', () => {
    const fontSizeFor = (n: number) => {
      const { unmount } = render(<AyahMedallion n={n} uiLocale="en" />);
      const size = parseFloat(screen.getByText(String(n)).style.fontSize);
      unmount();
      return size;
    };

    // Observed on device, build 49e4a81f: at maximum system font size the box
    // grows with fontScale, but the notched star has no flat side for the
    // digits to grow into, so three of them ran into the border. Two digits
    // had room and must keep full size -- shrinking every ayah number to fix
    // Al-Baqarah 286 would be a regression on the other 6000-odd verses.
    expect(fontSizeFor(99)).toBe(fontSizeFor(7));
    expect(fontSizeFor(286)).toBeLessThan(fontSizeFor(99));
  });

  it('draws the rosette as an outline with nothing painted behind it', () => {
    // Outline only as of M6d. The filled backing seated the rosette on the
    // page colour; on a glass card that same fill paints an opaque patch over
    // the surface the card exists to show through, and in dark mode it reads
    // as a hole in a card that is glowing over the bloom.
    const { container } = render(<AyahMedallion n={1} uiLocale="en" />);

    const paths = container.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    // The geometry still comes from the shared ornament module rather than a
    // literal copied into this component.
    expect(paths[0]?.getAttribute('d')).toBe(MEDALLION_OUTLINE_PATH);
    expect(paths[0]?.getAttribute('fill')).toBe('none');
  });

  it('takes its colours from the theme, not a hardcoded hex', () => {
    const { container } = render(
      <ThemeContext.Provider value={themeColors.dark}>
        <AyahMedallion n={1} uiLocale="en" />
      </ThemeContext.Provider>,
    );

    // A hardcoded hex here would render fine in light mode and produce a cream
    // rosette on a near-black background in dark mode.
    expect(container.querySelector('path')?.getAttribute('stroke')).toBe(themeColors.dark.mutedText);
    expect(screen.getByText('1').style.color).toBeTruthy();
  });
});
