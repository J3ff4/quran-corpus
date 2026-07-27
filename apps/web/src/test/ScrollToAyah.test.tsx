import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';

import { ScrollToAyah } from '../components/shared/ScrollToAyah';

/** Stands in for FontFaceSet, whose `ready` we resolve by hand per test. */
function stubFonts(): { settle: () => Promise<void> } {
  let resolve!: () => void;
  const ready = new Promise<void>((r) => {
    resolve = r;
  });
  Object.defineProperty(document, 'fonts', { value: { ready }, configurable: true });
  return {
    settle: async () => {
      resolve();
      await ready;
      // Let the .then callback run before the test asserts.
      await Promise.resolve();
    },
  };
}

/** jsdom exposes scrollY as a getter, so it can't be assigned directly. */
function setScrollY(y: number): void {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
}

function anchor(id: string): { el: HTMLElement; scrollSpy: ReturnType<typeof vi.fn> } {
  const el = document.createElement('div');
  el.id = id;
  const scrollSpy = vi.fn();
  (el as unknown as { scrollIntoView: () => void }).scrollIntoView = scrollSpy;
  document.body.appendChild(el);
  return { el, scrollSpy };
}

describe('ScrollToAyah', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    document.body.replaceChildren();
    Reflect.deleteProperty(document, 'fonts');
    setScrollY(0);
  });

  it('scrolls the matching anchor into view on mount', () => {
    const { scrollSpy } = anchor('ayah-255');
    render(<ScrollToAyah ayah={255} />);
    // 'instant', not 'auto' -- 'auto' defers to the smooth scroll-behavior in
    // globals.css, and a smooth scroll never re-aims after a font swap.
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
  });

  it('re-aims once the Arabic font swap has landed', async () => {
    const { scrollSpy } = anchor('ayah-255');
    const fonts = stubFonts();
    render(<ScrollToAyah ayah={255} />);
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    await fonts.settle();
    // The swap reflows every ayah above the target; without this second pass
    // the reader is left a screen or two off.
    expect(scrollSpy).toHaveBeenCalledTimes(2);
  });

  it('leaves the page alone once the reader has taken over', async () => {
    const { scrollSpy } = anchor('ayah-255');
    const fonts = stubFonts();
    render(<ScrollToAyah ayah={255} />);

    window.dispatchEvent(new Event('touchstart'));
    await fonts.settle();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it('re-aims even when the swap moved scrollY on its own', async () => {
    // The swap changes document height, so the browser clamps scrollY and
    // scroll anchoring adjusts it — neither is the user, and inferring intent
    // from position would skip the re-aim exactly on the long surahs that
    // need it.
    const { scrollSpy } = anchor('ayah-255');
    const fonts = stubFonts();
    render(<ScrollToAyah ayah={255} />);

    setScrollY(900);
    await fonts.settle();
    expect(scrollSpy).toHaveBeenCalledTimes(2);
  });

  it('falls back to the boolean form on engines without ScrollBehavior "instant"', () => {
    const { el, scrollSpy } = anchor('ayah-255');
    scrollSpy.mockImplementationOnce(() => {
      throw new TypeError("The provided value 'instant' is not a valid enum value");
    });

    expect(() => render(<ScrollToAyah ayah={255} />)).not.toThrow();
    expect(scrollSpy).toHaveBeenLastCalledWith(true);
    expect(el.isConnected).toBe(true);
  });

  it('does not re-aim after unmount', async () => {
    const { scrollSpy } = anchor('ayah-255');
    const fonts = stubFonts();
    const { unmount } = render(<ScrollToAyah ayah={255} />);
    unmount();

    await fonts.settle();
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the anchor is absent', () => {
    expect(() => render(<ScrollToAyah ayah={999} />)).not.toThrow();
  });
});
