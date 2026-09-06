import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

import { GlassSurface } from './GlassSurface';
import { ThemeContext, type ThemeColors } from '@/theme/themeContext';
import { glass, radii, themeColors } from '@/theme/tokens';
import { rgb, rgba } from '@/testing/rgb';

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

  it('lights its rim above the children, not under them', () => {
    // The recitation bar covers the translucent fill with an opaque backing --
    // RN has no backdrop-filter and a docked bar over scrolling text has to be
    // legible. As the first child, that backing painted straight over this 1px
    // line and the bar lost the top edge every other glass surface has.
    renderIn(themeColors.dark, <GlassSurface testID="card"><span>inside</span></GlassSurface>);

    expect(screen.getByTestId('card').lastElementChild).toBe(screen.getByTestId('card-highlight'));
  });

  it('backs a docked surface with an opaque ground', () => {
    // The fill is translucent and RN has no backdrop-filter, so a bar docked
    // over scrolling text is see-through unless something opaque sits between.
    // Both bars used to paint this themselves at opacity 0.94, and 6% of an
    // ayah reading through a tab label is what that bought (device, 2026-08-29).
    renderIn(themeColors.dark, <GlassSurface testID="bar" docked>{null}</GlassSurface>);

    const backing = screen.getByTestId('bar-backing');
    expect(backing.style.backgroundColor).toBe(rgb(themeColors.dark.background));
    // No opacity: anything below 1 is bleed-through by another name.
    expect(backing.style.opacity).toBe('');
  });

  it('leaves an undocked surface see-through', () => {
    // The default has to stay glass -- every card in the app is one, and an
    // opaque backing on all of them would flatten the whole design.
    renderIn(themeColors.dark, <GlassSurface testID="card">{null}</GlassSurface>);

    expect(screen.queryByTestId('card-backing')).toBeNull();
  });

  it('paints the docked backing under the children, not over them', () => {
    renderIn(themeColors.dark, <GlassSurface testID="bar" docked><span>inside</span></GlassSurface>);

    expect(screen.getByTestId('bar').firstElementChild).toBe(screen.getByTestId('bar-backing'));
  });

  it('renders its children', () => {
    renderIn(themeColors.light, <GlassSurface testID="card"><span>inside</span></GlassSurface>);

    expect(screen.getByText('inside')).toBeTruthy();
  });
});
