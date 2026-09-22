import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
vi.mock('@/settings/settingsStore', () => ({
  useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }),
}));

import { HeaderCard, type HeaderCardProps } from './HeaderCard';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

function renderCard(props: Partial<HeaderCardProps> = {}) {
  const onBack = vi.fn();
  render(
    <ThemeContext.Provider value={themeColors.dark}>
      <HeaderCard title="Al-Baqarah" uiLocale="en" testIDPrefix="x" onBack={onBack} {...props} />
    </ThemeContext.Provider>,
  );
  return { onBack };
}

describe('HeaderCard', () => {
  afterEach(cleanup);

  it('draws back, the name and nothing else it was not given', () => {
    renderCard();

    expect(screen.getByTestId('x-title').textContent).toBe('Al-Baqarah');
    // No curtain contents, no kebab: a button that unrolls nothing is worse
    // than no button.
    expect(screen.queryByTestId('x-actions')).toBeNull();
    expect(screen.queryByTestId('x-actions-row')).toBeNull();
  });

  it('holds the kebab a place when there is no kebab', () => {
    // The name is centred in the ROW, so with back on one side and nothing on
    // the other it centres in what is left and sits visibly off to the right.
    renderCard();

    const row = screen.getByTestId('x-title-row');
    // back, the title, and the spacer standing in for the actions button.
    expect(row.children.length).toBe(3);
  });

  it('opens and closes the curtain on the kebab', () => {
    renderCard({ actions: <div data-testid="curtain-body" /> });

    const kebab = screen.getByTestId('x-actions');
    expect(kebab.getAttribute('aria-expanded')).toBe('false');
    // Mounted but empty while shut -- Collapsible unmounts the children, which
    // is what keeps them off TalkBack's swipe order.
    expect(screen.getByTestId('x-actions-row').children.length).toBe(0);

    fireEvent.click(kebab);

    expect(kebab.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('curtain-body')).toBeTruthy();
  });

  it('spaces its rows without a container gap', () => {
    // The curtain is a mounted zero-height flex child while it is shut, and
    // flex gap still spaces a zero-height child -- a gap on the surface would
    // be paid for it, which is 10dp of dead chrome on every screen wearing
    // this card. Rows carry their own marginTop instead.
    renderCard({
      actions: <div />,
      middleRow: <div data-testid="middle" style={{ marginTop: 10 }} />,
    });

    const surface = screen.getByTestId('x-title-row').parentElement!;
    expect(surface.style.gap || '0px').toBe('0px');
  });

  it('takes no press on a name that is not on screen', () => {
    // The reader fades its name in as the list's heading leaves. Faded out, a
    // pressable name is an invisible hit target across the middle of the bar,
    // and TalkBack would offer a button for something the eye cannot see.
    const onTitlePress = vi.fn();
    renderCard({ titleVisible: false, onTitlePress });

    const jump = screen.getByTestId('x-surah-jump');
    fireEvent.click(jump);

    expect(onTitlePress).not.toHaveBeenCalled();
    // And out of TalkBack's swipe order, not merely inert: a button that
    // announces itself and then does nothing is the worse half of this.
    expect(jump.getAttribute('data-hidden-from-a11y')).toBe('true');
  });

  it('drops the caret when the name does nothing', () => {
    // The caret IS the affordance: drawn over a name that takes no presses it
    // points at a control that does not exist.
    const { onBack } = renderCard();
    fireEvent.click(screen.getByTestId('x-back'));
    expect(onBack).toHaveBeenCalled();

    expect(screen.getByTestId('x-title-row').textContent).toBe('Al-Baqarah');
  });
});
