import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClampedText } from '../components/ui/ClampedText';

/**
 * jsdom reports every element as 0x0, so overflow can never be detected for
 * real here. These tests stub the measurements on the HTMLElement prototype,
 * which is the only place the component looks.
 *
 * ClampedText reads scrollHeight (full content height) and the computed
 * font-size; it deliberately does NOT read clientHeight, because that equals
 * scrollHeight the moment the box opens. clientHeight is stubbed anyway, so
 * that a regression reintroducing it fails here instead of shipping.
 */
function stubHeights(scrollHeight: number, clientHeight: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  });
}

afterEach(() => {
  // @ts-expect-error -- restoring jsdom's own (absent) definitions
  delete HTMLElement.prototype.scrollHeight;
  // @ts-expect-error -- ditto
  delete HTMLElement.prototype.clientHeight;
  vi.unstubAllGlobals();
});

describe('ClampedText', () => {
  it('text that fits renders no toggle at all', () => {
    stubHeights(100, 100);
    render(<ClampedText label="root definition">short</ClampedText>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('overflowing text gets a Show more toggle', () => {
    stubHeights(500, 200);
    render(<ClampedText label="root definition">long…</ClampedText>);
    expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
  });

  it('toggle flips the label and aria-expanded', () => {
    stubHeights(500, 200);
    render(<ClampedText label="root definition">long…</ClampedText>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(btn);
    expect(screen.getByRole('button', { name: /show less/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: /show more/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('aria-controls points at the element the button actually collapses', () => {
    // A disclosure with aria-expanded but no aria-controls leaves a screen
    // reader unable to find what moved.
    stubHeights(500, 200);
    const { container } = render(<ClampedText label="root definition">long…</ClampedText>);
    const btn = screen.getByRole('button');
    const controlled = btn.getAttribute('aria-controls');
    expect(controlled).toBeTruthy();
    expect(container.querySelector(`#${CSS.escape(controlled!)}`)).toHaveTextContent('long…');
  });

  it('collapsed box is clamped to the requested number of lines', () => {
    stubHeights(500, 200);
    const { container } = render(
      <ClampedText label="root definition" lines={8} lineHeight={1.625}>
        long…
      </ClampedText>,
    );
    const box = container.querySelector('.clamp-box') as HTMLElement;
    expect(box.style.maxHeight).toBe('13em'); // 8 * 1.625
    expect(box.style.overflow).toBe('hidden');
  });

  it('expanding releases the height ceiling so no definition can be cropped', () => {
    stubHeights(500, 200);
    const { container } = render(<ClampedText label="root definition">long…</ClampedText>);
    const box = container.querySelector('.clamp-box') as HTMLElement;

    fireEvent.click(screen.getByRole('button'));
    // Mid-transition: a concrete px target so max-height has two lengths to
    // interpolate between.
    expect(box.style.maxHeight).toBe('500px');

    // Settled: the ceiling is gone entirely and the box sizes to content.
    fireEvent.transitionEnd(box, { propertyName: 'max-height' });
    expect(box.style.maxHeight).toBe('');
    expect(box.style.overflow).toBe('');
  });

  it('a transitionend for some other property does not release the ceiling early', () => {
    stubHeights(500, 200);
    const { container } = render(<ClampedText label="root definition">long…</ClampedText>);
    const box = container.querySelector('.clamp-box') as HTMLElement;
    fireEvent.click(screen.getByRole('button'));
    fireEvent.transitionEnd(box, { propertyName: 'opacity' });
    expect(box.style.maxHeight).toBe('500px');
  });

  it('releases the ceiling even when transitionend never fires', () => {
    // Regression: `prefers-reduced-motion` sets `transition: none`, so opening
    // fires no transitionend and the px ceiling measured at click time stayed
    // pinned forever. A later reflow -- rotation, text-size bump, late font
    // swap -- then re-wraps the text taller than that stale height and
    // `overflow: hidden` crops the tail unreachably.
    vi.useFakeTimers();
    try {
      stubHeights(500, 200);
      const { container } = render(<ClampedText label="root definition">long…</ClampedText>);
      const box = container.querySelector('.clamp-box') as HTMLElement;

      fireEvent.click(screen.getByRole('button'));
      expect(box.style.maxHeight).toBe('500px');

      // No transitionend at all -- the reduced-motion case.
      act(() => void vi.advanceTimersByTime(600));
      expect(box.style.maxHeight).toBe('');
      expect(box.style.overflow).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('collapsing from rest returns to the clamp with no stale px ceiling', () => {
    stubHeights(500, 200);
    const { container } = render(<ClampedText label="root definition">long…</ClampedText>);
    const box = container.querySelector('.clamp-box') as HTMLElement;

    fireEvent.click(screen.getByRole('button'));
    fireEvent.transitionEnd(box, { propertyName: 'max-height' });
    expect(box.style.maxHeight).toBe('');

    // Closing from the settled state has no length to animate *from*, so it
    // snaps -- and must not re-pin a px height that nothing would release.
    fireEvent.click(screen.getByRole('button'));
    expect(box.style.maxHeight).toBe('13em');
    expect(box.style.overflow).toBe('hidden');
  });

  it('clamps in the server HTML but leaves it scrollable until measured', () => {
    // The point of a CSS clamp over a JS one: long text is already cropped in
    // the first paint, with no frame where the full definition renders and then
    // collapses. The `.clamp-box` escape hatch that releases this for readers
    // with no JS lives in the root layout, emitted once for all instances.
    //
    // But that hatch is a <noscript> rule, so it covers scripting *disabled*
    // and not scripting *enabled and broken*. A 404'd chunk, a blocked bundle
    // or a hydration error caught by an error boundary all leave this exact
    // markup on screen with no toggle and no rule to release it, and
    // `overflow:hidden` would then crop a 1479-character definition
    // permanently. `auto` keeps it reachable in every one of those states; the
    // measured client flips it to `hidden` and puts the real toggle up.
    const html = renderToStaticMarkup(<ClampedText label="root definition">long…</ClampedText>);
    expect(html).toContain('max-height:13em');
    expect(html).toContain('overflow:auto');
    expect(html).not.toContain('overflow:hidden');
  });

  it('switches to hidden once the client has measured an overflow', () => {
    // The other half of the contract above: `auto` is the unmeasured state, not
    // the resting one. Once a toggle exists the scrollbar must go, or the
    // clamped box grows a nested scroll region that eats the page's wheel
    // events and competes with the fade mask.
    stubHeights(500, 200);
    const { container } = render(<ClampedText label="root definition">long…</ClampedText>);
    expect(screen.getByRole('button')).toBeInTheDocument();
    expect((container.querySelector('.clamp-box') as HTMLElement).style.overflow).toBe('hidden');
  });

  it('keeps the toggle after expanding, even when the box resizes to fit', () => {
    // Regression: measuring `scrollHeight > clientHeight` reads false the
    // moment the ceiling lifts and the two become equal, so the ResizeObserver
    // firing at the end of the expand transition deleted the "Show less"
    // button and stranded the box open. Overflow is measured against the
    // CLAMP height instead, which does not move when the box opens.
    let trigger: (() => void) | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          trigger = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    stubHeights(500, 200);
    const { container } = render(<ClampedText label="root definition">long…</ClampedText>);
    const box = container.querySelector('.clamp-box') as HTMLElement;

    fireEvent.click(screen.getByRole('button'));
    fireEvent.transitionEnd(box, { propertyName: 'max-height' });
    // Expanded: the element now reports its full height as its client height.
    stubHeights(500, 500);
    act(() => trigger!());

    expect(screen.getByRole('button', { name: /show less/i })).toBeInTheDocument();
  });

  it('re-measures once the real font metrics land', async () => {
    // The Arabic faces load with `display: swap`, so the first measure runs
    // against fallback metrics. The ResizeObserver does not cover this: while
    // collapsed the box height is pinned by max-height, so a content-only
    // height change never alters the observed box and no callback fires. Text
    // that fit in the fallback face and overflows in the real one would be
    // cropped with no fade, no scrollbar and no toggle.
    let resolveFonts: () => void = () => {};
    vi.stubGlobal('document', document);
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        ready: new Promise<void>((r) => {
          resolveFonts = r;
        }),
      },
    });
    try {
      stubHeights(100, 100); // fallback face: fits, so no toggle
      render(<ClampedText label="root definition">long…</ClampedText>);
      expect(screen.queryByRole('button')).toBeNull();

      // Real face swaps in and the text now runs past eight lines.
      stubHeights(500, 100);
      await act(async () => {
        resolveFonts();
      });
      expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
    } finally {
      // @ts-expect-error -- restoring jsdom's own (absent) definition
      delete document.fonts;
    }
  });

  it('re-measures when the content itself changes', () => {
    // Same bug class as the font swap, reached by props: while collapsed the
    // box height is pinned by max-height, so replacing the children with longer
    // text changes no observed box and fires no ResizeObserver callback. The
    // mount-time verdict would stand and the new text would be cropped with no
    // toggle. Every caller today remounts (routes key on the param, definitions
    // key on their id), so this guards the component's contract rather than a
    // live path.
    stubHeights(100, 100); // fits
    const { rerender } = render(<ClampedText label="root definition">short</ClampedText>);
    expect(screen.queryByRole('button')).toBeNull();

    stubHeights(500, 100); // same instance, longer content
    rerender(<ClampedText label="root definition">a much longer definition…</ClampedText>);
    expect(screen.getByRole('button', { name: /show more/i })).toBeInTheDocument();
  });

  it('re-measures when the box resizes', () => {
    // A definition that overflows at 375px may fit at 768px; a stale measure
    // would strand a toggle that no longer does anything.
    let trigger: (() => void) | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          trigger = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    stubHeights(500, 200);
    render(<ClampedText label="root definition">long…</ClampedText>);
    expect(screen.getByRole('button')).toBeInTheDocument();

    // Now it fits. act() because the observer fires outside React's event
    // system, so the state update would not otherwise be flushed.
    stubHeights(100, 200);
    act(() => trigger!());
    expect(screen.queryByRole('button')).toBeNull();
  });
});
