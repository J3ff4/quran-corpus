import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import { useIncrementalReveal } from '../hooks/useIncrementalReveal';

// --- IntersectionObserver mock -------------------------------------------------
type IOCallback = (entries: { isIntersecting: boolean }[]) => void;
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IOCallback;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  constructor(cb: IOCallback) {
    this.callback = cb;
    MockIntersectionObserver.instances.push(this);
  }
  fire() { this.callback([{ isIntersecting: true }]); }
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// Harness: attaches sentinelRef to a real DOM node so the observer effect runs.
function Harness({ total, initial, step }: { total: number; initial: number; step: number }) {
  const { visibleCount, sentinelRef, done } = useIncrementalReveal<HTMLButtonElement>(
    total, initial, step,
  );
  return (
    <>
      <span data-testid="count">{visibleCount}</span>
      <span data-testid="done">{String(done)}</span>
      {!done && <button ref={sentinelRef}>sentinel</button>}
    </>
  );
}

const lastObserver = () =>
  MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1]!;

describe('useIncrementalReveal', () => {
  beforeEach(() => { MockIntersectionObserver.instances = []; });

  it('starts at min(initial, total)', () => {
    const { result } = renderHook(() => useIncrementalReveal(100, 20, 20));
    expect(result.current.visibleCount).toBe(20);
    expect(result.current.done).toBe(false);
  });

  it('total <= initial => done, visibleCount === total', () => {
    const { result } = renderHook(() => useIncrementalReveal(7, 20, 20));
    expect(result.current.visibleCount).toBe(7);
    expect(result.current.done).toBe(true);
  });

  it('observer intersect bumps visibleCount by step, capped at total', () => {
    render(<Harness total={45} initial={20} step={20} />);
    expect(screen.getByTestId('count').textContent).toBe('20');
    act(() => { lastObserver().fire(); });
    expect(screen.getByTestId('count').textContent).toBe('40');
    act(() => { lastObserver().fire(); });   // 40 + 20 -> capped at 45
    expect(screen.getByTestId('count').textContent).toBe('45');
    expect(screen.getByTestId('done').textContent).toBe('true');
  });

  it('revealTo is monotonic non-shrinking and clamps to total', () => {
    const { result } = renderHook(() => useIncrementalReveal(100, 20, 20));
    act(() => { result.current.revealTo(50); });
    expect(result.current.visibleCount).toBe(50);
    act(() => { result.current.revealTo(30); });   // smaller -> no-op
    expect(result.current.visibleCount).toBe(50);
    act(() => { result.current.revealTo(999); });  // clamp to total
    expect(result.current.visibleCount).toBe(100);
    expect(result.current.done).toBe(true);
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = render(<Harness total={45} initial={20} step={20} />);
    const observer = lastObserver();
    unmount();
    expect(observer.disconnect).toHaveBeenCalled();
  });
});
