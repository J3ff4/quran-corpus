import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';

// Overrides the blanket mock in setup.ts so the refresh call is observable.
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

import { LocaleSwitcher } from '../components/shared/LocaleSwitcher';
import { UI_LOCALE_COOKIE, SCRIPT_COOKIE } from '../lib/locale';

function clearCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  });
}

const cookie = (name: string) =>
  document.cookie
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);

/** Opens the disclosure and returns a query scope limited to the panel -- the
 *  trigger echoes the current language, so an unscoped query matches twice. */
function open(locale: 'en' | 'uz' | 'ru' = 'en', script: 'latin' | 'cyrillic' = 'latin') {
  render(<LocaleSwitcher locale={locale} script={script} />);
  const trigger = screen.getByRole('button', { name: /language/i });
  fireEvent.click(trigger);
  return within(document.getElementById(trigger.getAttribute('aria-controls')!)!);
}

describe('LocaleSwitcher', () => {
  beforeEach(() => {
    clearCookies();
    refresh.mockClear();
    vi.restoreAllMocks();
  });

  it('pairs aria-expanded with aria-controls on the panel it toggles', () => {
    render(<LocaleSwitcher locale="en" script="latin" />);
    const trigger = screen.getByRole('button', { name: /language/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    const panelId = trigger.getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).not.toBeNull();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('writes the locale cookie and refreshes at the write site', () => {
    const panel = open();
    fireEvent.click(panel.getByRole('button', { name: /Русский/ }));
    expect(cookie(UI_LOCALE_COOKIE)).toBe('ru');
    // Without the refresh the App Router serves the cached server render and
    // the new language appears only on the next hard navigation (#57).
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('offers the script row only for the locale that has two alphabets', () => {
    expect(open('uz').getByRole('button', { name: /Кирилл/ })).toBeInTheDocument();
    cleanup();
    expect(open('en').queryByRole('button', { name: /Кирилл/ })).toBeNull();
  });

  it('keeps the script row reachable after the UI leaves Uzbek with Cyrillic stored', () => {
    // The script cookie reaches any `?lang=uz` page whatever the UI locale is,
    // so an English UI can still be rendering Cyrillic content. Hiding the row
    // on the UI locale alone would strand that reader with no control to undo
    // it -- the switch out of Uzbek is one click, the way back would be none.
    expect(open('en', 'cyrillic').getByRole('button', { name: /Lotin/ })).toBeInTheDocument();
    cleanup();
    // Still hidden at the default, where there is nothing to undo.
    expect(open('en', 'latin').queryByRole('button', { name: /Lotin/ })).toBeNull();
  });

  it('shows the server\'s locale, not an optimistic one, when the cookie write fails', () => {
    // A browser that blocks or drops the cookie leaves the server rendering
    // the old locale. An optimistic highlight would claim the switch happened
    // and stay wrong for as long as the drawer is mounted.
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {});
    const panel = open('en');
    fireEvent.click(panel.getByRole('button', { name: /Русский/ }));

    expect(panel.getByRole('button', { name: /Русский/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(panel.getByRole('button', { name: /English/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('writes the script cookie separately from the locale', () => {
    const panel = open('uz');
    fireEvent.click(panel.getByRole('button', { name: /Кирилл/ }));
    expect(cookie(SCRIPT_COOKIE)).toBe('cyrillic');
    expect(cookie(UI_LOCALE_COOKIE)).toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('marks the stored locale as the pressed one', () => {
    const panel = open('ru');
    expect(panel.getByRole('button', { name: /Русский/ })).toHaveAttribute('aria-pressed', 'true');
    expect(panel.getByRole('button', { name: /O'zbek/ })).toHaveAttribute('aria-pressed', 'false');
  });
});
