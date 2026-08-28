import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DictionaryRow } from './DictionaryRow';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('expo-router', () => ({ router: { push: mocks.push } }));
vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
// The row squeezes on press, so it reaches usePressScale -> useReducedMotion,
// which reads the in-app setting as well as the system one; the real store
// opens expo-secure-store, which jsdom has no counterpart for.
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }) }));

describe('DictionaryRow', () => {
  afterEach(cleanup);

  it('names the row so the count is announced as a count', () => {
    render(<DictionaryRow uiLocale="en" arabic="قول" count={1722} href="/root/qwl" />);

    // .getAttribute, not the jest-dom toHaveAttribute matcher: jest-dom is an
    // apps/web dependency only (see InfoSheet.test.tsx / DefinitionCard.test.tsx).
    expect(screen.getByTestId('dictionary-row').getAttribute('aria-label')).toBe(
      'قول, 1722 occurrences',
    );
  });

  it('leads with the rank when ranked, and with the count when not', () => {
    // Both mockups draw the same three columns (m6g-1, m6g-2); the ranked pane
    // and Browse differ only in what the first two carry. A row that always
    // led with the count would put an unranked-looking number at the head of a
    // ranked list, and one that always led with the rank would show Browse a
    // position in a list that is not ordered by anything.
    const { rerender } = render(
      <DictionaryRow uiLocale="en" rank={3} arabic="قول" count={5} href="/root/qwl" />,
    );
    expect(screen.getByTestId('dictionary-rank').textContent).toBe('3');

    rerender(<DictionaryRow uiLocale="en" arabic="قول" translit="qwl" count={5} href="/root/qwl" />);
    expect(screen.queryByTestId('dictionary-rank')).toBeNull();
    // The count is still on screen, in the gutter the rank vacated, and the
    // transliteration has taken the middle column.
    const row = screen.getByTestId('dictionary-row');
    expect(row.textContent).toContain('5');
    expect(row.textContent).toContain('qwl');
  });

  it('opens what it points at', () => {
    render(<DictionaryRow uiLocale="en" arabic="قول" count={5} href="/root/qwl" />);

    fireEvent.click(screen.getByTestId('dictionary-row'));

    expect(mocks.push).toHaveBeenCalledWith('/root/qwl');
  });
});
