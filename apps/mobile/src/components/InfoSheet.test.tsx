import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InfoButton, InfoSheet } from './InfoSheet';

// The shell has its own suite (BottomSheet.test.tsx). Stubbed here so this one
// covers the wiring -- accessible name, open/close state, what body reaches
// the sheet -- without pulling reanimated and gesture-handler into it, same
// approach as LanguageSheet.test.tsx. closeLabel is surfaced as an attribute
// so a test can assert InfoSheet passes its own 'lemma.close' string through.
vi.mock('./BottomSheet', async () => {
  const React = await import('react');
  return {
    BottomSheet: ({
      onClose,
      closeLabel,
      children,
    }: {
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

describe('InfoButton', () => {
  afterEach(cleanup);

  it('names the info button with the given label and reports its state', () => {
    const onPress = vi.fn();
    const { rerender } = render(
      <InfoButton label="About these translations" expanded={false} onPress={onPress} />,
    );

    const button = screen.getByTestId('info-button');
    expect(button.getAttribute('aria-label')).toBe('About these translations');
    // aria-expanded, not aria-pressed: rnHosts maps accessibilityState.expanded
    // only, not .pressed -- see LemmaScreen.test.tsx's note on the same
    // mapping.
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(<InfoButton label="About these translations" expanded onPress={onPress} />);
    expect(screen.getByTestId('info-button').getAttribute('aria-expanded')).toBe('true');
  });

  it('renders no sheet of its own', () => {
    // The whole point of the split: a sheet mounted beside this button would
    // lay out inside whatever short row the button sits in, because
    // BottomSheet fills its parent rather than the window.
    render(<InfoButton label="About these translations" expanded onPress={() => {}} />);

    expect(screen.queryByTestId('sheet')).toBeNull();
  });
});

describe('InfoSheet', () => {
  afterEach(cleanup);

  it('renders the given body under the label as a heading', () => {
    render(
      <InfoSheet
        label="About these translations"
        body="Some note."
        uiLocale="en"
        onClose={() => {}}
      />,
    );

    // .textContent, not the jest-dom toHaveTextContent matcher: jest-dom is an
    // apps/web dependency only (see DefinitionCard.test.tsx).
    expect(screen.getByTestId('info-body').textContent).toBe('Some note.');
    expect(screen.getByTestId('sheet').getAttribute('data-close-label')).toBe('Close');
    // getByRole('heading'), not a role-attribute read: it is the query a
    // screen reader's heading navigation models, and it is exactly what
    // accessibilityRole="header" fails -- that prop lands as role="header",
    // the ARIA banner landmark, which this query cannot match. Without this
    // line the deliberate role="heading" here is untested and silently
    // revertible.
    expect(screen.getByRole('heading').textContent).toBe('About these translations');
  });

  it('passes a dismissal straight through to its owner', () => {
    const onClose = vi.fn();
    render(
      <InfoSheet label="About these translations" body="Some note." uiLocale="en" onClose={onClose} />,
    );

    fireEvent.click(screen.getByTestId('close-sheet'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
