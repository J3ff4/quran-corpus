import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// public/theme-init.js is a plain <script src> (see layout.tsx) — not an ES
// module, so exercise it by evaluating its source directly against jsdom's
// globals, the same way the browser would run it.
const scriptSrc = readFileSync(resolve(__dirname, '../../public/theme-init.js'), 'utf-8');

function run() {
  new Function(scriptSrc)();
}

function stubMatchMedia(prefersDark: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: prefersDark })));
}

describe('theme-init.js', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    stubMatchMedia(false);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('applies dark for a stored dark preference', () => {
    localStorage.setItem('theme', 'dark');
    run();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('stored light wins over an OS dark preference', () => {
    localStorage.setItem('theme', 'light');
    stubMatchMedia(true);
    run();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('falls back to OS preference when nothing is stored', () => {
    stubMatchMedia(true);
    run();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('syncs the <html> class on a storage event, independent of any mounted component', () => {
    run();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'light' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('ignores storage events for unrelated keys', () => {
    run();
    window.dispatchEvent(new StorageEvent('storage', { key: 'other', newValue: 'dark' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
