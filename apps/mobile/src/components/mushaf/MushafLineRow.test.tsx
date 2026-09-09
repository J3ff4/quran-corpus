import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// pageFont pulls expo-font, and through it expo-modules-core, whose logger
// setup reads __DEV__ and dies at import time under jsdom. mushafFontFamily
// itself is pure -- only its module's neighbours need standing in for.
vi.mock('expo-font', () => ({ loadAsync: vi.fn(async () => undefined) }));
vi.mock('@/mushaf/fontManifest.generated', () => ({ MUSHAF_FONT_ASSETS: {} }));

vi.mock('react-native', async () => {
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return reactNativeTextMock();
});

import { MushafLineRow } from './MushafLineRow';

const w = (ayahNumber: number, position: number, glyph: string) => ({
  surahId: 2,
  ayahNumber,
  position,
  charType: 'word' as const,
  glyph,
});

const props = {
  page: 46,
  fontSize: 21,
  lineHeight: 40,
  colorForAyah: () => '#000000',
  onWordPress: vi.fn(),
};

afterEach(cleanup);

describe('MushafLineRow', () => {
  it('joins the words with nothing at all', () => {
    // A space is not in these fonts, so joining with one silently drops the
    // whole line into the system face.
    const { container } = render(<MushafLineRow {...props} words={[w(1, 1, 'A'), w(1, 2, 'B')]} />);
    expect(container.textContent).toBe('AB');
  });

  it('drops the separator space inside a word-s glyph string', () => {
    // 198 layout rows hold two glyph codes split by U+0020, which no QCF font
    // carries. Task 2's metrics gave it zero width, so drawing it would make
    // those 197 pages wider than they were measured -- and the space alone is
    // enough to push the run into the system face.
    const { container } = render(<MushafLineRow {...props} words={[w(1, 1, 'A B')]} />);
    expect(container.textContent).toBe('AB');
  });

  it('renders in the page-s own family', () => {
    const { container } = render(<MushafLineRow {...props} words={[w(1, 1, 'A')]} />);
    expect(container.innerHTML).toContain('QCF2046');
  });

  it('colours each ayah-s words from colorForAyah', () => {
    const colorForAyah = (_s: number, ayah: number) => (ayah === 1 ? '#ff0000' : '#00ff00');
    const { container } = render(
      <MushafLineRow {...props} colorForAyah={colorForAyah} words={[w(1, 1, 'A'), w(2, 1, 'B')]} />,
    );
    // Read back as rgb(): the DOM normalises a hex colour on the way in, so an
    // assertion looking for '#ff0000' in the markup can never pass, however
    // right the component is.
    const colors = Array.from(container.querySelectorAll('span span')).map(
      (el) => (el as HTMLElement).style.color,
    );
    expect(colors).toEqual(['rgb(255, 0, 0)', 'rgb(0, 255, 0)']);
  });

  it('clips rather than wraps, so a line cannot push the page off its grid', () => {
    const { container } = render(<MushafLineRow {...props} words={[w(1, 1, 'A')]} />);
    expect(container.querySelector('[data-lines="1"]')).not.toBeNull();
  });

  it('centres the line', () => {
    // Finding 2: QCF pre-justifies its lines, so centring needs no threshold.
    const { container } = render(<MushafLineRow {...props} words={[w(1, 1, 'A')]} />);
    expect(container.innerHTML).toContain('center');
  });

  it('hides the glyph run from TalkBack', () => {
    // Ruling 12: the codes are private-use characters. The ayah label is
    // published by MushafPage; a line reading them aloud is gibberish.
    const { container } = render(<MushafLineRow {...props} words={[w(1, 1, 'A')]} />);
    expect(container.querySelector('[data-hidden-from-a11y="true"]')).not.toBeNull();
  });

  it('hands the tapped word back', () => {
    const onWordPress = vi.fn();
    render(<MushafLineRow {...props} onWordPress={onWordPress} words={[w(7, 3, 'A')]} />);
    fireEvent.click(screen.getByText('A'));
    expect(onWordPress).toHaveBeenCalledWith(expect.objectContaining({ ayahNumber: 7, position: 3 }));
  });
});
