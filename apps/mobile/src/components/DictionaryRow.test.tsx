import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DictionaryRow } from './DictionaryRow';

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('expo-router', () => ({ router: { push: mocks.push } }));
vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');
  return { Pressable: host('button'), Text: host('span'), View: host('div') };
});

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

  it('shows a rank when it was given one, and none otherwise', () => {
    const { rerender } = render(
      <DictionaryRow uiLocale="en" rank={3} arabic="قول" count={5} href="/root/qwl" />,
    );
    expect(screen.getByTestId('dictionary-rank').textContent).toBe('3');

    rerender(<DictionaryRow uiLocale="en" arabic="قول" count={5} href="/root/qwl" />);
    expect(screen.queryByTestId('dictionary-rank')).toBeNull();
  });

  it('opens what it points at', () => {
    render(<DictionaryRow uiLocale="en" arabic="قول" count={5} href="/root/qwl" />);

    fireEvent.click(screen.getByTestId('dictionary-row'));

    expect(mocks.push).toHaveBeenCalledWith('/root/qwl');
  });
});
