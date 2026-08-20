import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VersePicker } from './VersePicker';

vi.mock('react-native', async () => {
  const { host } = await import('@/testing/rnHosts.js');

  return {
    Pressable: host('button'),
    Text: host('span'),
    View: host('div'),
  };
});

const handlers = { onRange: () => {} };

describe('VersePicker', () => {
  afterEach(cleanup);

  it('shows the current range', () => {
    render(<VersePicker from={11} to={20} ayahCount={286} uiLocale="en" {...handlers} />);

    expect(screen.getByText('11–20')).toBeTruthy();
  });

  it('disables previous on the first page', () => {
    render(<VersePicker from={1} to={10} ayahCount={286} uiLocale="en" {...handlers} />);

    expect(screen.getByTestId('wbw-prev').getAttribute('aria-disabled')).toBe('true');
  });

  it('disables next on the last page', () => {
    // 286 is not a multiple of 10, so the last page is 281-286. An off-by-one
    // here either hides ayah 286 or offers an empty page past the end.
    render(<VersePicker from={281} to={286} ayahCount={286} uiLocale="en" {...handlers} />);

    expect(screen.getByTestId('wbw-next').getAttribute('aria-disabled')).toBe('true');
  });

  it('clamps the final page to the surah length', () => {
    const onRange = vi.fn();
    render(<VersePicker from={271} to={280} ayahCount={286} uiLocale="en" onRange={onRange} />);

    fireEvent.click(screen.getByTestId('wbw-next'));

    expect(onRange).toHaveBeenCalledWith(281, 286);
  });

  it('does not step past the start when the first page is short', () => {
    // Al-Kawthar is 3 ayahs. Stepping back from 1 must stay at 1..3 rather
    // than offering ayah -9, which resolves to an empty page.
    const onRange = vi.fn();
    render(<VersePicker from={1} to={3} ayahCount={3} uiLocale="en" onRange={onRange} />);

    fireEvent.click(screen.getByTestId('wbw-prev'));

    expect(onRange).not.toHaveBeenCalled();
  });

  it('gives both controls a 48dp target', () => {
    render(<VersePicker from={11} to={20} ayahCount={286} uiLocale="en" {...handlers} />);

    for (const id of ['wbw-prev', 'wbw-next']) {
      expect(Number(screen.getByTestId(id).style.minHeight.replace('px', ''))).toBeGreaterThanOrEqual(48);
    }
  });
});
