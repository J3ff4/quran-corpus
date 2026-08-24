import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

import { GlassSurface } from './GlassSurface';
import { ThemeContext, type ThemeColors } from '@/theme/themeContext';
import { glass, radii, themeColors } from '@/theme/tokens';
import { rgba } from '@/testing/rgb';

function renderIn(theme: ThemeColors, element: React.ReactElement) {
  return render(<ThemeContext.Provider value={theme}>{element}</ThemeContext.Provider>);
}

describe('GlassSurface', () => {
  afterEach(cleanup);

  it('fills and outlines itself from the active theme', () => {
    renderIn(themeColors.dark, <GlassSurface testID="card">{null}</GlassSurface>);

    const card = screen.getByTestId('card');
    expect(card.style.backgroundColor).toBe(rgba(glass.dark.fill));
    expect(card.style.borderColor).toBe(rgba(glass.dark.border));
  });

  it('takes the light skin under the light theme', () => {
    // The theme branch, asserted from both sides: a component hardcoded to one
    // skin renders a perfectly plausible card in the wrong mode.
    renderIn(themeColors.light, <GlassSurface testID="card">{null}</GlassSurface>);

    expect(screen.getByTestId('card').style.backgroundColor).toBe(rgba(glass.light.fill));
  });

  it('draws the inset highlight as a child, not as a border', () => {
    // The highlight is the top 1px of the card and the whole reason the fill
    // reads as glass rather than as a grey rectangle. A borderTopColor cannot
    // express it -- RN paints all four edges at one width unless each side is
    // set, and per-side borders disable the shadow on Android.
    renderIn(themeColors.dark, <GlassSurface testID="card">{null}</GlassSurface>);

    expect(screen.getByTestId('card-highlight').style.backgroundColor).toBe(rgba(glass.dark.highlight));
  });

  it('takes its radius from the named token', () => {
    renderIn(themeColors.light, <GlassSurface testID="bar" radius="pill">{null}</GlassSurface>);

    expect(screen.getByTestId('bar').style.borderRadius).toBe(`${radii.pill}px`);
  });

  it('defaults to the card radius', () => {
    renderIn(themeColors.light, <GlassSurface testID="card">{null}</GlassSurface>);

    expect(screen.getByTestId('card').style.borderRadius).toBe(`${radii.card}px`);
  });

  it('renders its children', () => {
    renderIn(themeColors.light, <GlassSurface testID="card"><span>inside</span></GlassSurface>);

    expect(screen.getByText('inside')).toBeTruthy();
  });
});
