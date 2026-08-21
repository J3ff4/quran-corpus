import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InfoSheet } from './InfoSheet';

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

describe('InfoSheet', () => {
  afterEach(cleanup);

  it('names the info button with the given label and starts closed', () => {
    render(<InfoSheet label="About these translations" body="Some note." uiLocale="en" />);

    const button = screen.getByTestId('info-button');
    expect(button.getAttribute('aria-label')).toBe('About these translations');
    // aria-expanded, not aria-pressed: rnHosts maps accessibilityState.expanded
    // only, not .pressed -- see LemmaScreen.test.tsx's note on the same
    // mapping.
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByTestId('info-body')).toBeNull();
  });

  it('opens the sheet with the given body on tap', () => {
    render(<InfoSheet label="About these translations" body="Some note." uiLocale="en" />);

    fireEvent.click(screen.getByTestId('info-button'));

    expect(screen.getByTestId('info-button').getAttribute('aria-expanded')).toBe('true');
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

  it('closes when the sheet reports a dismissal', () => {
    render(<InfoSheet label="About these translations" body="Some note." uiLocale="en" />);

    fireEvent.click(screen.getByTestId('info-button'));
    expect(screen.getByTestId('info-body')).toBeTruthy();

    fireEvent.click(screen.getByTestId('close-sheet'));
    expect(screen.queryByTestId('info-body')).toBeNull();
  });
});
