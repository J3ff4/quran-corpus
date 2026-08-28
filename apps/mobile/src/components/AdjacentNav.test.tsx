import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdjacentNav, AdjacentNavButton } from './AdjacentNav';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
// The chevrons squeeze on press, so they reach usePressScale ->
// useReducedMotion, which reads the in-app setting as well as the system one;
// the real store opens expo-secure-store, which jsdom has no counterpart for.
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }) }));

describe('AdjacentNav', () => {
  afterEach(cleanup);

  it('routes each side to its own target and disables an end of the list', () => {
    const onNavigate = vi.fn();
    render(
      <AdjacentNav prev={null} next="ktb" onNavigate={onNavigate} label="Adjacent" uiLocale="en" />,
    );

    // Disabled, not hidden: a vanishing arrow slides the other one under the
    // thumb, and TalkBack is left with nothing where a control used to be.
    const previous = screen.getByTestId('root-previous') as HTMLButtonElement;
    // Both halves: aria-disabled is what TalkBack announces, and the disabled
    // prop is what stops RN dispatching the press. Asserting only the first
    // leaves the second free to be dropped -- onPress is already undefined at
    // an end, so 'onNavigate was not called' passes either way.
    expect(previous.getAttribute('aria-disabled')).toBe('true');
    expect(previous.disabled).toBe(true);
    fireEvent.click(previous);
    expect(onNavigate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('root-next'));
    // The side travels with the target: paging is a router.replace, and a
    // replaced route arrives with no direction of its own, so this callback is
    // the only thing that can tell the screen which way to slide (D4).
    expect(onNavigate).toHaveBeenCalledWith('ktb', 'next');
  });

  it('names its controls from the prefix so two screens can both use it', () => {
    render(
      <AdjacentNav
        prev="a"
        next="b"
        onNavigate={vi.fn()}
        label="Adjacent"
        uiLocale="en"
        testIDPrefix="lemma"
      />,
    );

    expect(screen.getByTestId('lemma-previous')).toBeTruthy();
    expect(screen.getByTestId('lemma-next')).toBeTruthy();
  });

  it('inflects the Russian labels for the screen it is on', () => {
    // Russian agrees the adjective with the noun: корень is masculine, лемма is
    // feminine. Sharing one pair of strings put "Предыдущий" over a toolbar
    // labelled "Соседние леммы".
    //
    // Read off aria-label, not textContent: since D3 the control is a bare
    // chevron, so the inflected string IS its accessible name and nothing else.
    // A chevron with no name announces as "button".
    render(
      <AdjacentNav prev="a" next="b" onNavigate={vi.fn()} label="Соседние корни" uiLocale="ru" />,
    );
    expect(screen.getByTestId('root-previous').getAttribute('aria-label')).toBe('Предыдущий');

    cleanup();
    render(
      <AdjacentNav
        prev="a"
        next="b"
        onNavigate={vi.fn()}
        label="Соседние леммы"
        uiLocale="ru"
        testIDPrefix="lemma"
      />,
    );
    expect(screen.getByTestId('lemma-previous').getAttribute('aria-label')).toBe('Предыдущая');
    expect(screen.getByTestId('lemma-next').getAttribute('aria-label')).toBe('Следующая');
  });

  it('names a surah chevron for a screen reader', () => {
    render(
      <AdjacentNavButton side="prev" target="1" onNavigate={vi.fn()} uiLocale="en" testIDPrefix="surah" />,
    );

    // A chevron announces as nothing on its own, and "Previous" alone does not
    // say previous *what* when the same control shape also pages entries.
    expect(screen.getByTestId('surah-previous')).toBeTruthy();
    expect(screen.getByLabelText('Previous surah')).toBeTruthy();
  });

  it('disables a surah chevron that has nowhere to go', () => {
    const onNavigate = vi.fn();
    render(
      <AdjacentNavButton side="next" target={null} onNavigate={onNavigate} uiLocale="en" testIDPrefix="surah" />,
    );

    const next = screen.getByTestId('surah-next') as HTMLButtonElement;
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(next.disabled).toBe(true);
    fireEvent.click(next);
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
