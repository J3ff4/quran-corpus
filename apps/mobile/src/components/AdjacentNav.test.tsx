import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdjacentNav } from './AdjacentNav';

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return { Pressable: host('button'), Text: host('span'), View: host('div') };
});

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
    expect(onNavigate).toHaveBeenCalledWith('ktb');
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
    render(
      <AdjacentNav prev="a" next="b" onNavigate={vi.fn()} label="Соседние корни" uiLocale="ru" />,
    );
    expect(screen.getByTestId('root-previous').textContent).toContain('Предыдущий');

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
    expect(screen.getByTestId('lemma-previous').textContent).toContain('Предыдущая');
    expect(screen.getByTestId('lemma-next').textContent).toContain('Следующая');
  });
});
