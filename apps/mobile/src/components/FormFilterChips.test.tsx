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

/** The two handlers, for the cases that do not care which one fired. */
const NOOPS = { onToggle: () => {}, onClear: () => {} };

describe('FormFilterChips', () => {
  afterEach(cleanup);

  it('shows the form and its count, and nothing else', () => {
    // Mockup m6g-4, adopted 2026-08-27: the label, reading and gloss the chip
    // used to carry as well made a six-form root three rows deep before the
    // concordance started. .textContent, not the jest-dom matcher: jest-dom is
    // an apps/web dependency only (see DefinitionCard.test.tsx).
    render(<FormFilterChips uiLocale="en" forms={FORMS} selected={[]} {...NOOPS} />);
    const chip = screen.getAllByTestId('form-chip')[0]!;
    expect(chip.textContent).toContain('قَالَ');
    expect(chip.textContent).toContain('1618');
    expect(chip.textContent).not.toContain('Form I verb');
    expect(chip.textContent).not.toContain('qāla');
    expect(chip.textContent).not.toContain('to say');
  });

  it('keeps what it stopped showing in the accessible name', () => {
    // The part of speech is a tint now, and a screen reader gets nothing from
    // a colour (§8). Everything the chip stopped drawing has to still be
    // announced, or the redesign costs TalkBack users the whole distinction.
    render(<FormFilterChips uiLocale="en" forms={FORMS} selected={[]} {...NOOPS} />);
    expect(screen.getAllByTestId('form-chip')[0]!.getAttribute('aria-label')).toBe(
      'qāla, Form I verb, to say, 1618',
    );
  });

  it('heads the row with an All chip that clears the selection', () => {
    // Empty selection already meant "every form"; with several chips lit there
    // was no single tap back to it (mockup m6g-4).
    const onClear = vi.fn();
    render(
      <FormFilterChips uiLocale="en" forms={FORMS} selected={[1, 2]} onToggle={() => {}} onClear={onClear} />,
    );
    const all = screen.getByTestId('form-chip-all');
    expect(all.textContent).toBe('All');
    // Not lit while a filter is on: it is the state the row returns to, not a
    // sixth form.
    expect(all.getAttribute('aria-selected')).toBe('false');
    fireEvent.click(all);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('lights the All chip when no form is selected', () => {
    render(<FormFilterChips uiLocale="en" forms={FORMS} selected={[]} {...NOOPS} />);
    expect(screen.getByTestId('form-chip-all').getAttribute('aria-selected')).toBe('true');
  });

  it('counts the forms beside the label', () => {
    render(<FormFilterChips uiLocale="en" forms={FORMS} selected={[]} {...NOOPS} />);
    // Label first, count second: "6 форм" needs a different noun form from
    // "2 формы", and no locale has to agree with a number in this order.
    expect(screen.getByTestId('form-filter-count').textContent).toBe('forms · 2');
  });

  it('reports selection to TalkBack, not only in colour', () => {
    render(<FormFilterChips uiLocale="en" forms={FORMS} selected={[2]} {...NOOPS} />);
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
    render(<FormFilterChips uiLocale="en" forms={FORMS} selected={[]} onToggle={onToggle} onClear={() => {}} />);
    fireEvent.click(screen.getAllByTestId('form-chip')[1]!);
    expect(onToggle).toHaveBeenCalledWith(2);
  });

  it('renders nothing for a root with no forms', () => {
    const { container } = render(
      <FormFilterChips uiLocale="en" forms={[]} selected={[]} {...NOOPS} />,
    );
    expect(container.querySelector('[data-testid="form-chip"]')).toBeNull();
    // The All chip goes with them: a row with nothing to filter is not a row.
    expect(container.querySelector('[data-testid="form-chip-all"]')).toBeNull();
  });
});
