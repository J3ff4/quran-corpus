import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => {
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return reactNativeTextMock();
});

import { SURAH_BAND_PATH } from '@quran-corpus/config/ornaments/surahBand';

import { BismillahLine } from './BismillahLine';
import { PageFooter } from './PageFooter';
import { SurahBand } from './SurahBand';

afterEach(cleanup);

describe('SurahBand', () => {
  it('names the surah inside the band', () => {
    const { container } = render(<SurahBand surahName="Al-Ma-idah" height={40} />);
    expect(container.textContent).toContain('Al-Ma-idah');
  });

  it('labels itself for TalkBack, since the art carries no text', () => {
    render(<SurahBand surahName="Al-Ma-idah" height={40} />);
    expect(screen.getByLabelText('Al-Ma-idah')).toBeTruthy();
  });

  it('draws the shared arabesque, not a copy of it', () => {
    const { container } = render(<SurahBand surahName="Al-Ma-idah" height={40} />);
    const path = container.querySelector('path');
    expect(path?.getAttribute('d')).toBe(SURAH_BAND_PATH);
  });

  it('draws it in the art-s own authoring box', () => {
    // The path's coordinates only mean anything against this viewBox, and a
    // wrong one renders a blank or a sliver rather than an error. Neither
    // consumer's suite noticed a corrupted viewBox until this assertion and
    // its web twin were added.
    const { container } = render(<SurahBand surahName="Al-Ma-idah" height={40} />);
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 -500 16320 2000');
  });

  it('keeps the art at the band-s own aspect ratio', () => {
    // 8.16:1. A band stretched to the line box would distort the arabesque.
    const { container } = render(<SurahBand surahName="Al-Ma-idah" height={40} />);
    expect(container.querySelector('svg')?.getAttribute('width')).toBe(String(40 * 8.16));
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

describe('PageFooter', () => {
  it('shows the page number and its juz', () => {
    const { container } = render(<PageFooter page={106} juz={6} uiLocale="en" />);
    const text = container.textContent ?? '';
    expect(text).toContain('106');
    expect(text).toContain('6');
  });

  it('speaks the numbers with their labels, in the ui locale', () => {
    render(<PageFooter page={106} juz={6} uiLocale="ru" />);
    expect(screen.getByLabelText(/Страница 106/)).toBeTruthy();
  });
});
