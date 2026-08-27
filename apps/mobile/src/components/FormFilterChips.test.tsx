import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormFilterChips } from './FormFilterChips';

// reactNativeTextMock, not a bare host() factory: the shared mock is what
// maps testID/accessibilityState the same way every other suite in this repo
// asserts on, see its doc comment in rnHosts.ts.
vi.mock('react-native', async () => {
  const { reactNativeTextMock } = await import('@/testing/rnHosts.js');
  return reactNativeTextMock();
});
// A chip squeezes on press, so it reaches usePressScale -> useReducedMotion,
// which reads the in-app setting as well as the system one; the real store
// opens expo-secure-store, which jsdom has no counterpart for.
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ uiLocale: 'en', reduceMotion: false }) }));

const FORMS = [
  { id: 1, root_id: 1, sort_order: 0, pos_label: 'Form I verb', form_arabic: 'قَالَ',
    form_translit: 'qāla', gloss: 'to say', occurrence_count: 1618 },
  { id: 2, root_id: 1, sort_order: 1, pos_label: 'Noun', form_arabic: 'قَوْل',
    form_translit: 'qawl', gloss: 'word', occurrence_count: 92 },
];

describe('FormFilterChips', () => {
  afterEach(cleanup);

  it('renders every field the chip carries', () => {
    render(<FormFilterChips uiLocale="en" forms={FORMS} selected={[]} onToggle={() => {}} />);
    // .textContent, not the jest-dom toHaveTextContent matcher: jest-dom is
    // an apps/web dependency only (see DefinitionCard.test.tsx).
    const chip = screen.getAllByTestId('form-chip')[0]!;
    expect(chip.textContent).toContain('Form I verb');
    expect(chip.textContent).toContain('قَالَ');
    expect(chip.textContent).toContain('qāla');
    expect(chip.textContent).toContain('to say');
    expect(chip.textContent).toContain('1618');
  });

  it('reports selection to TalkBack, not only in colour', () => {
    render(<FormFilterChips uiLocale="en" forms={FORMS} selected={[2]} onToggle={() => {}} />);
    const chips = screen.getAllByTestId('form-chip');
    const [first, second] = [chips[0]!, chips[1]!];
    // aria-selected, not aria-pressed: the component sets
    // accessibilityState.selected (Material filter-chip semantics, same as
    // the Frequent pane's kind chips), which RN's AccessibilityState and this
    // repo's rnHosts mock both map to aria-selected. RN has no `pressed`
    // state and rnHosts never emits aria-pressed, so an assertion against
    // that attribute would read `null` and fail for every chip regardless of
    // selection -- it would not be testing this component at all.
    expect(first.getAttribute('aria-selected')).toBe('false');
    expect(second.getAttribute('aria-selected')).toBe('true');
  });

  it('toggles the chip it was tapped on', () => {
    const onToggle = vi.fn();
    render(<FormFilterChips uiLocale="en" forms={FORMS} selected={[]} onToggle={onToggle} />);
    fireEvent.click(screen.getAllByTestId('form-chip')[1]!);
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  it('renders nothing for a root with no forms', () => {
    const { container } = render(
      <FormFilterChips uiLocale="en" forms={[]} selected={[]} onToggle={() => {}} />,
    );
    expect(container.querySelector('[data-testid="form-chip"]')).toBeNull();
  });
});
