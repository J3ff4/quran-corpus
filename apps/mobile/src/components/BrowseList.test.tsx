import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowseList, type BrowseItem } from './BrowseList';

vi.mock('react-native', async () => (await import('@/testing/rnHosts.js')).reactNativeTextMock());
// The rows squeeze on press, so they reach usePressScale -> useReducedMotion,
// which reads the in-app setting; the real store opens expo-secure-store.
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }) }));

function item(overrides: Partial<BrowseItem> = {}): BrowseItem {
  return {
    key: 'juz-1',
    leading: '1',
    title: 'Juz 1',
    accessibilityLabel: 'Juz 1',
    onPress: vi.fn(),
    ...overrides,
  };
}

/** The chevron's CSS transform. Read off the node rather than off the shared
 *  value: rnHosts folds RN's transform array into a string precisely so a
 *  rotation is assertable at all. */
function rotationOf(testID: string) {
  return screen.getByTestId(testID).style.transform;
}

/** Every glass card in the render. A card is the thing with a shadow, which
 *  the shim folds into boxShadow for exactly this kind of assertion. */
function cards() {
  return Array.from(screen.getByTestId('browse-list-root').querySelectorAll('*')).filter(
    (node) => (node as HTMLElement).style.boxShadow !== '',
  );
}

afterEach(cleanup);

describe('BrowseList disclosure rows', () => {
  it('draws no chevron on a row that is not a disclosure', () => {
    render(<BrowseList items={[item()]} />);

    expect(screen.queryByTestId('browse-chevron-juz-1')).toBeNull();
  });

  it('turns the chevron as the curtain unrolls', () => {
    // One glyph that rotates, not two that swap: the chevron turning in step
    // with the card opening is what says THIS card opened, rather than that
    // unrelated rows arrived beneath it.
    const { rerender } = render(<BrowseList items={[item({ expanded: false })]} />);
    expect(rotationOf('browse-chevron-juz-1')).toBe('rotate(0deg)');

    rerender(<BrowseList items={[item({ expanded: true })]} />);
    expect(rotationOf('browse-chevron-juz-1')).toBe('rotate(90deg)');
  });

  it('draws an expanded juz as one card, not as four', () => {
    // The children were sibling rows, each in its own GlassSurface with the
    // same shape as a juz card -- so an expanded juz read as four juz (owner
    // screenshot, 2026-09-11).
    render(
      <div data-testid="browse-list-root">
        <BrowseList
          items={[
            item({
              expanded: true,
              children: [
                item({ key: 'c1', testID: 'child-1', title: 'Al-Fatiha 1-7', accessibilityLabel: 'Al-Fatiha' }),
                item({ key: 'c2', testID: 'child-2', title: 'Al-Baqara 1-141', accessibilityLabel: 'Al-Baqara' }),
              ],
            }),
          ]}
        />
      </div>,
    );

    expect(within(screen.getByTestId('child-1')).getByText('Al-Fatiha 1-7')).toBeTruthy();
    expect(cards()).toHaveLength(1);
  });

  it('keeps a collapsed juz childless', () => {
    render(
      <BrowseList
        items={[
          item({
            expanded: false,
            children: [item({ key: 'c1', title: 'Al-Fatiha 1-7', accessibilityLabel: 'Al-Fatiha' })],
          }),
        ]}
      />,
    );

    expect(screen.queryByText('Al-Fatiha 1-7')).toBeNull();
  });

  it('opens the child a tap landed on, not the juz around it', () => {
    // The card's surface sits outside the disclosure Pressable for this
    // reason: wrapped inside it, every child tap is swallowed as a toggle and
    // the ranges become decoration.
    const onPress = vi.fn();
    const childPress = vi.fn();
    render(
      <BrowseList
        items={[
          item({
            expanded: true,
            onPress,
            children: [
              item({ key: 'c1', testID: 'child-1', title: 'Al-Fatiha 1-7', accessibilityLabel: 'Al-Fatiha', onPress: childPress }),
            ],
          }),
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId('child-1'));

    expect(childPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('announces the disclosure state to a screen reader', () => {
    render(<BrowseList items={[item({ expanded: false })]} />);

    // Without this a chevron is decoration: TalkBack reads the row as a plain
    // button and never says the ranges under it exist.
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');
  });

  it('leaves aria-expanded off a row that opens something', () => {
    render(<BrowseList items={[item()]} />);

    // A surah row navigates; announcing it as collapsed would promise a
    // disclosure that is not there.
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBeNull();
  });
});

describe('BrowseList collapsible sections', () => {
  const section = {
    title: 'Meccan',
    count: 2,
    data: [item({ key: 'a', title: 'Al-Alaq', accessibilityLabel: 'Al-Alaq' })],
  };

  it('renders a plain header when the section is not collapsible', () => {
    render(<BrowseList sections={[{ title: 'Meccan', data: section.data }]} />);

    expect(screen.getByText('Al-Alaq')).toBeTruthy();
    expect(screen.queryByTestId('browse-section-Meccan')).toBeNull();
  });

  it('shows the count and toggles on press', () => {
    const onToggle = vi.fn();
    render(<BrowseList sections={[{ ...section, expanded: true, onToggle }]} />);

    expect(screen.getByText('2')).toBeTruthy();
    fireEvent.click(screen.getByTestId('browse-section-Meccan'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders no rows while the section is collapsed', () => {
    render(<BrowseList sections={[{ ...section, expanded: false, onToggle: vi.fn() }]} />);

    // The header survives its own collapse, or there is nothing to reopen.
    expect(screen.getByTestId('browse-section-Meccan')).toBeTruthy();
    expect(screen.queryByText('Al-Alaq')).toBeNull();
  });

  it('announces the section state to a screen reader', () => {
    render(<BrowseList sections={[{ ...section, expanded: false, onToggle: vi.fn() }]} />);

    expect(screen.getByTestId('browse-section-Meccan').getAttribute('aria-expanded')).toBe('false');
  });
});
