import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { InfoPopover } from '../components/ui/InfoPopover';

/**
 * Renders one popover and returns its trigger.
 *
 * Every test starts from the same closed state and reaches the panel through
 * `aria-controls` rather than a test id, so the assertions exercise the same
 * relationship a screen reader follows.
 */
function renderOne() {
  render(<InfoPopover label="About these translations">the note</InfoPopover>);
  return screen.getByRole('button', { name: 'About these translations' });
}

describe('InfoPopover', () => {
  it('starts closed with the note hidden but still in the DOM', () => {
    const btn = renderOne();
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    // Present-but-hidden, not unmounted: `aria-controls` on the trigger has to
    // resolve to a real element for the relationship to be announced at all.
    const note = document.getElementById(btn.getAttribute('aria-controls')!);
    expect(note).not.toBeNull();
    expect(note!.hasAttribute('hidden')).toBe(true);
    expect(note!.textContent).toBe('the note');
  });

  it('toggles open and shut on click', () => {
    const btn = renderOne();
    const note = document.getElementById(btn.getAttribute('aria-controls')!)!;

    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(note.hasAttribute('hidden')).toBe(false);

    // A second click closes. The outside-click listener sees this same click
    // bubble to the document, so this is the regression guard for the two
    // fighting: if the listener did not skip its own trigger, it would close
    // the panel and `onClick` would reopen it, and the button would never shut.
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(note.hasAttribute('hidden')).toBe(true);
  });

  it('closes on Escape', () => {
    const btn = renderOne();
    fireEvent.click(btn);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on a click outside, and ignores one inside', () => {
    const btn = renderOne();
    const note = document.getElementById(btn.getAttribute('aria-controls')!)!;
    fireEvent.click(btn);

    // Inside the panel: selecting the note's text must not dismiss it.
    fireEvent.click(note);
    expect(btn.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(document.body);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  // The dismiss deliberately does NOT run on pointerdown. The panel is in the
  // flow, so closing it shifts everything below up by its height; doing that
  // mid-tap moves the target out from under the finger and the browser
  // dispatches the click to a common ancestor instead of the link that was
  // aimed at, swallowing the first tap on anything beneath the note.
  it('stays open through a pointerdown, so an outside tap does not reflow mid-gesture', () => {
    const btn = renderOne();
    fireEvent.click(btn);

    fireEvent.pointerDown(document.body);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('unbinds its document listeners once shut', () => {
    const btn = renderOne();
    fireEvent.click(btn);
    fireEvent.keyDown(document, { key: 'Escape' });
    // Already closed; a stray outside tap must not throw or re-toggle. Cheap
    // proxy for "the effect cleaned up" -- a leaked listener on an unmounted
    // tree is what would surface here as a React state-update warning.
    fireEvent.click(document.body);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });
});
