import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }) }));

import { RecitationBar } from './RecitationBar';
import { ThemeContext } from '@/theme/themeContext';
import { themeColors } from '@/theme/tokens';

function renderBar(props: Partial<React.ComponentProps<typeof RecitationBar>> = {}) {
  const onTogglePlay = vi.fn();
  render(
    <ThemeContext.Provider value={themeColors.dark}>
      <RecitationBar ayahNumber={255} playing onTogglePlay={onTogglePlay} uiLocale="en" {...props} />
    </ThemeContext.Provider>,
  );
  return onTogglePlay;
}

describe('RecitationBar', () => {
  afterEach(cleanup);

  it('is not rendered when nothing is playing', () => {
    renderBar({ ayahNumber: null, playing: false });

    expect(screen.queryByTestId('recitation-bar')).toBeNull();
  });

  it('names the ayah it is playing', () => {
    // A bar that says only "Pause" gives a screen-reader user no way to tell
    // which ayah is sounding.
    renderBar();

    expect(screen.getByTestId('recitation-bar').getAttribute('aria-label')).toContain('255');
  });

  it('toggles playback', () => {
    const onTogglePlay = renderBar();

    fireEvent.click(screen.getByLabelText('Pause'));

    expect(onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it('offers to resume rather than to pause once playback has stopped', () => {
    // The bar outlives the sound: it stays docked on the ayah that was playing
    // so a tap resumes it. Labelled "Pause" while nothing plays, the one
    // control on the bar would lie about what it does.
    renderBar({ playing: false });

    expect(screen.getByLabelText('Play')).toBeTruthy();
    expect(screen.queryByLabelText('Pause')).toBeNull();
  });
});
