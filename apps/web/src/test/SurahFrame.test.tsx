import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SurahFrame } from '../components/reader/ornaments/SurahFrame';

describe('SurahFrame', () => {
  it('frames the surah name and hides decoration from a11y', () => {
    render(
      <SurahFrame surahNumber={2}>
        <span>البقرة</span>
      </SurahFrame>,
    );
    expect(screen.getByText('البقرة')).toBeInTheDocument();
    expect(document.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('uses the wide banner aspect ratio and currentColor theming', () => {
    const { container } = render(
      <SurahFrame surahNumber={2}>
        <span>test</span>
      </SurahFrame>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('aspect-[204/25]');
    const path = container.querySelector('svg path');
    expect(path).not.toBeNull();
    expect(path?.getAttribute('fill')).toBe('currentColor');
  });

  it('centers content with inset-y, not vertical padding', () => {
    // Regression: padding-top/bottom percentages resolve against the
    // containing block's WIDTH regardless of axis (CSS spec), which on
    // this 8.16:1 frame overshoots the real height and pushes content
    // out below the frame. inset-y resolves against height correctly.
    const { container } = render(
      <SurahFrame surahNumber={2}>
        <span>test</span>
      </SurahFrame>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    const overlay = wrapper.querySelector(':scope > div') as HTMLElement;
    expect(overlay.className).not.toMatch(/(^|\s)py-\[/);
    expect(overlay.className).toMatch(/(^|\s)inset-y-\[/);
  });

  it('a real-world caller hides the glyph and exposes an sr-only name', () => {
    render(
      <SurahFrame surahNumber={2}>
        <p aria-hidden="true">{String.fromCodePoint(0xe002)}</p>
        <span className="sr-only">البقرة</span>
      </SurahFrame>,
    );
    const glyph = document.querySelector('p[aria-hidden="true"]');
    expect(glyph).not.toBeNull();
    expect(screen.getByText('البقرة')).toHaveClass('sr-only');
  });

  it('renders the surah number in both medallions: Eastern Arabic-Indic (right) and Western (left)', () => {
    render(
      <SurahFrame surahNumber={114}>
        <span>test</span>
      </SurahFrame>,
    );
    expect(screen.getByText('١١٤')).toBeInTheDocument();
    expect(screen.getByText('114')).toBeInTheDocument();
    expect(screen.getByText('Surah 114')).toHaveClass('sr-only');
  });

  it('marks both numeral medallions decorative (the sr-only text carries the a11y name)', () => {
    render(
      <SurahFrame surahNumber={1}>
        <span>test</span>
      </SurahFrame>,
    );
    const eastern = screen.getByText('١');
    const western = screen.getByText('1');
    expect(eastern).toHaveAttribute('aria-hidden', 'true');
    expect(western).toHaveAttribute('aria-hidden', 'true');
  });

  it('bumps 1-2 digit Western numerals 10% bigger but keeps 3-digit ones at the base size', () => {
    const { rerender } = render(
      <SurahFrame surahNumber={1}>
        <span>test</span>
      </SurahFrame>,
    );
    expect(screen.getByText('1')).toHaveStyle({ fontSize: '0.561rem' });

    rerender(
      <SurahFrame surahNumber={114}>
        <span>test</span>
      </SurahFrame>,
    );
    expect(screen.getByText('114')).toHaveStyle({ fontSize: '0.51rem' });
  });

  it('shrinks 3-digit Eastern Arabic-Indic numerals 8% but keeps 1-2 digit ones at the base size', () => {
    const { rerender } = render(
      <SurahFrame surahNumber={1}>
        <span>test</span>
      </SurahFrame>,
    );
    expect(screen.getByText('١')).toHaveStyle({ fontSize: '0.85rem' });

    rerender(
      <SurahFrame surahNumber={114}>
        <span>test</span>
      </SurahFrame>,
    );
    expect(screen.getByText('١١٤')).toHaveStyle({ fontSize: '0.782rem' });
  });

  it("uses Amiri (not font-arabic/kfgqpc) for the Eastern numeral, since kfgqpc's digit glyphs carry their own decorative roundel", () => {
    render(
      <SurahFrame surahNumber={1}>
        <span>test</span>
      </SurahFrame>,
    );
    const eastern = screen.getByText('١');
    expect(eastern.className).not.toMatch(/(^|\s)font-arabic(\s|$)/);
    expect(eastern).toHaveStyle({ fontFamily: "'Amiri', 'Amiri Fallback'" });
  });
});
