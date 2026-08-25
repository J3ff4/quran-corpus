import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageSheet } from './LanguageSheet';

// The shell has its own suite. Stubbed here so this one covers the wiring --
// which language is announced selected, what a pick does -- without pulling
// reanimated and gesture-handler into it. closeLabel is surfaced as an
// attribute so the test can assert the sheet names its own backdrop.
vi.mock('./BottomSheet', async () => {
  const React = await import('react');
  return {
    BottomSheet: ({ onClose, closeLabel, children }: {
      onClose: () => void;
      closeLabel: string;
      children: React.ReactNode;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'sheet', 'data-close-label': closeLabel },
        React.createElement('button', { 'data-testid': 'close-sheet', onClick: onClose }),
        children,
      ),
  };
});

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return {
    Pressable: host('button'),
    Text: host('span'),
    View: host('div'),
  };
});

const handlers = {
  value: 'en' as const,
  uiLocale: 'en' as const,
  onChange: () => {},
  onClose: () => {},
};

describe('LanguageSheet', () => {
  afterEach(cleanup);

  it('offers every shipped content language', () => {
    render(<LanguageSheet {...handlers} />);

    const options = screen.getAllByRole('radio');
    expect(options).toHaveLength(3);
    // Exactly the nativeLabel strings in i18n/languages.ts -- note the straight
    // apostrophe in "O'zbek".
    expect(options.map((option) => option.textContent)).toEqual(['English', "O'zbek", 'Русский']);
  });

  it('marks the current language selected', () => {
    render(<LanguageSheet {...handlers} value="ru" />);

    // By aria-selected. LanguageSelector sets both `selected` and `checked`
    // and rnHosts maps both, so either would do here; this asserts the one the
    // radio role reads from on Android.
    const selected = screen
      .getAllByRole('radio')
      .filter((option) => option.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]!.textContent).toBe('Русский');
  });

  it('reports the pick and closes itself in one tap', () => {
    // Both, not just onChange: leaving the sheet open over the reader means the
    // user has to dismiss a sheet to see the translation they just chose.
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<LanguageSheet {...handlers} onChange={onChange} onClose={onClose} />);

    fireEvent.click(screen.getByText('Русский'));

    expect(onChange).toHaveBeenCalledWith('ru');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not re-report a language that is already active', () => {
    // A no-op write still re-renders the reader and re-runs its surah query.
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(<LanguageSheet {...handlers} value="en" onChange={onChange} onClose={onClose} />);

    fireEvent.click(screen.getByText('English'));

    expect(onChange).not.toHaveBeenCalled();
    // Still closes -- tapping the active language is a "yes, that one" gesture.
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('names its own backdrop rather than leaving the shell to guess', () => {
    render(<LanguageSheet {...handlers} />);

    expect(screen.getByTestId('sheet').getAttribute('data-close-label')).toBe('Close');
  });

  it('gives every language option a 48dp touch target', () => {
    render(<LanguageSheet {...handlers} />);

    for (const option of screen.getAllByRole('radio')) {
      expect(Number(option.style.minHeight.replace('px', ''))).toBeGreaterThanOrEqual(48);
    }
  });

  it('heads the sheet so the list is not three unexplained pills', () => {
    render(<LanguageSheet {...handlers} />);

    // By text, not by role: rnHosts passes accessibilityRole through verbatim,
    // so RN's "header" lands as role="header", which is not the ARIA role
    // getByRole('heading') looks for.
    expect(screen.getByText('Choose translation language')).toBeTruthy();
  });
});
