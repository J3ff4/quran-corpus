import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SurahFrame } from '../components/reader/ornaments/SurahFrame';

describe('SurahFrame', () => {
  it('frames the surah name and hides decoration from a11y', () => {
    render(
      <SurahFrame>
        <span>البقرة</span>
      </SurahFrame>,
    );
    expect(screen.getByText('البقرة')).toBeInTheDocument();
    expect(document.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('uses the wide banner aspect ratio and currentColor theming', () => {
    const { container } = render(
      <SurahFrame>
        <span>test</span>
      </SurahFrame>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('aspect-[204/25]');
    const path = container.querySelector('svg path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('fill')).toBe('currentColor');
  });
});
