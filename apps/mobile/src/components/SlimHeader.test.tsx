import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());

import { SlimHeader } from './SlimHeader';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

function renderHeader(props: { title: string; caption?: string }) {
  render(
    <ThemeContext.Provider value={themeColors.dark}>
      <SlimHeader testID="slim" {...props} />
    </ThemeContext.Provider>,
  );
}

describe('SlimHeader', () => {
  afterEach(cleanup);

  it('announces the title as the screen heading', () => {
    renderHeader({ title: 'Dictionary', caption: '1642 roots' });

    // The bar replaced a masthead (owner ruling D1). If it stops being a
    // heading, TalkBack's heading navigation lands on the first list row
    // instead and the screen has no name at all.
    // 'header', not 'heading': rnHosts maps accessibilityRole straight
    // through, and RN spells it 'header'.
    expect(screen.getByRole('header').textContent).toBe('Dictionary');
  });

  it('shows the caption when there is one, and nothing when there is not', () => {
    renderHeader({ title: 'Dictionary', caption: '1642 roots' });
    expect(screen.getByTestId('slim-caption').textContent).toBe('1642 roots');

    cleanup();
    renderHeader({ title: 'Dictionary' });

    // Not an empty caption element: a bar with a stray empty span in it lays
    // the title out against a gap rather than against the right edge.
    expect(screen.queryByTestId('slim-caption')).toBeNull();
  });
});
