import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('framer-motion', () => ({ useReducedMotion: () => false }));

import { ScrollToAyah } from '../components/wbw/ScrollToAyah';

describe('ScrollToAyah', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('scrolls the matching anchor into view on mount', () => {
    const el = document.createElement('div');
    el.id = 'ayah-255';
    const scrollSpy = vi.fn();
    (el as unknown as { scrollIntoView: () => void }).scrollIntoView = scrollSpy;
    document.body.appendChild(el);

    render(<ScrollToAyah ayah={255} />);
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    el.remove();
  });

  it('does nothing when the anchor is absent', () => {
    expect(() => render(<ScrollToAyah ayah={999} />)).not.toThrow();
  });
});
