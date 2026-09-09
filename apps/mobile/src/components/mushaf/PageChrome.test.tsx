import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return reactNativeTextMock();
});

import { SURAH_BAND_PATH } from '@quran-corpus/config/ornaments/surahBand';

import { BismillahLine } from './BismillahLine';
import { PageCorners } from './PageCorners';
import { SurahBand } from './SurahBand';

afterEach(cleanup);

describe('SurahBand', () => {
  it('names the surah inside the band', () => {
    const { container } = render(<SurahBand surahName="Al-Ma-idah" surahId={5} height={40} width={400} />);
    expect(container.textContent).toContain('Al-Ma-idah');
  });

  it('labels itself for TalkBack, since the art carries no text', () => {
    render(<SurahBand surahName="Al-Ma-idah" surahId={5} height={40} width={400} />);
    expect(screen.getByLabelText('Al-Ma-idah')).toBeTruthy();
  });

  it('draws the shared arabesque, not a copy of it', () => {
    const { container } = render(<SurahBand surahName="Al-Ma-idah" surahId={5} height={40} width={400} />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('d')).toBe(SURAH_BAND_PATH);
  });

  it('draws it in the art-s own authoring box', () => {
    // The path's coordinates only mean anything against this viewBox, and a
    // wrong one renders a blank or a sliver rather than an error. Neither
    // consumer's suite noticed a corrupted viewBox until this assertion and
    // its web twin were added.
    const { container } = render(<SurahBand surahName="Al-Ma-idah" surahId={5} height={40} width={400} />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 -500 16320 2000');
  });

  it('keeps the art at the band-s own aspect ratio', () => {
    // 8.16:1. A band stretched to the line box would distort the arabesque.
    const { container } = render(<SurahBand surahName="Al-Ma-idah" surahId={5} height={40} width={400} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe(String(40 * 8.16));
  });

  it('fills both cutouts with the surah-s number, one script each', () => {
    // Ruling 10. The two medallions are cutouts in the band's single path, and
    // their positions come from the shared module rather than from a
    // measurement taken twice.
    render(<SurahBand surahName="An-Nas" surahId={114} height={40} width={400} />);

    expect(screen.getByTestId('band-numeral-western').textContent).toBe('114');
    expect(screen.getByTestId('band-numeral-eastern').textContent).toBe('١١٤');
  });

  it('keeps the numerals out of the reading order, since the name is there', () => {
    // Read aloud they are the same fact twice, in two alphabets.
    render(<SurahBand surahName="An-Nas" surahId={114} height={40} width={400} />);

    expect(
      screen.getByTestId('band-numeral-eastern').getAttribute('data-hidden-from-a11y'),
    ).toBe('true');
  });

  it('fits the column when the line box is taller than the column can carry', () => {
    // The real case, not a synthetic one: a 15-line grid on a 360dp screen
    // gives a ~50dp line box inside a 328dp column, and 50 * 8.16 is 408.
    // Before this the band drew 408dp wide and lost both of its ends.
    const { container } = render(<SurahBand surahName="Al-Ma-idah" surahId={5} height={50} width={328} />);
    const svg = container.querySelector('svg');
    expect(Number(svg?.getAttribute('width'))).toBeCloseTo(328);
    expect(Number(svg?.getAttribute('height'))).toBeCloseTo(328 / 8.16);
  });
});

describe('BismillahLine', () => {
  it('draws the bismillah centred at the line-s own height', () => {
    const { container } = render(
      <BismillahLine text="BISMILLAH" fontSize={21} lineHeight={40} uiLocale="en" />,
    );
    expect(container.textContent).toContain('BISMILLAH');
    expect(container.innerHTML).toContain('center');
  });

  it('draws in Hafs, not in the page-s glyph font', () => {
    // The layout carries no row for this line, so there is no QCF glyph for
    // it. Asking the page font for real Arabic gets tofu.
    const { container } = render(
      <BismillahLine text="BISMILLAH" fontSize={21} lineHeight={40} uiLocale="en" />,
    );
    expect(container.innerHTML).toContain('Hafs');
  });
});

describe('PageCorners', () => {
  const props = { juz: 6, surahName: 'Al-Maidah', uiLocale: 'en' as const };

  it('shows the page number, its juz and the surah the page opens with', () => {
    const { container } = render(<PageCorners {...props} page={106} />);
    const text = container.textContent ?? '';
    expect(text).toContain('106');
    expect(text).toContain('Juz 6');
    expect(text).toContain('Al-Maidah');
  });

  it('puts an odd page-s number on the right and an even one on the left', () => {
    // Ruling 8: the outer edge of the leaf. Odd pages are rectos, and with one
    // page on screen at a time the alternation is all that is left of the
    // spread -- and it is what a reader's thumb learns.
    const numberBox = () =>
      screen.getByTestId('page-number') as HTMLElement;

    render(<PageCorners {...props} page={47} />);
    expect(numberBox().style.right).toBe('16px');
    expect(numberBox().style.left).toBe('');
    cleanup();

    render(<PageCorners {...props} page={48} />);
    expect(numberBox().style.left).toBe('16px');
    expect(numberBox().style.right).toBe('');
  });

  it('never takes a touch, since it sits over the words', () => {
    // The corners are absolutely positioned over the text block. One that
    // swallowed a press would make the words under it impossible to open.
    const { container } = render(<PageCorners {...props} page={106} />);
    expect(container.firstElementChild?.getAttribute('data-pointer-events')).toBe('none');
  });

  it('speaks the numbers with their labels, in the ui locale', () => {
    render(<PageCorners {...props} page={106} uiLocale="ru" />);
    expect(screen.getByLabelText(/Страница 106/)).toBeTruthy();
  });
});
