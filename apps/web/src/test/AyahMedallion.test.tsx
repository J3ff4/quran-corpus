import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  MEDALLION_BACKING_PATH,
  MEDALLION_OUTLINE_PATH,
} from '@quran-corpus/config/ornaments/medallion';
import { AyahMedallion } from '../components/reader/ornaments/AyahMedallion';

describe('AyahMedallion', () => {
  it('renders ayah number inside an ornamental medallion with a11y label', () => {
    render(<AyahMedallion n={7} />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByLabelText('Ayah 7')).toBeInTheDocument();
  });

  it('draws both layers from the shared ornament geometry', () => {
    const { container } = render(<AyahMedallion n={1} />);

    const [backing, outline] = Array.from(container.querySelectorAll('path')).map((path) =>
      path.getAttribute('d'),
    );
    // Web and mobile draw one marker from one source (CLAUDE.md §3). Wiring
    // either layer to the wrong export renders a plausible-looking shape while
    // the two products quietly diverge.
    expect(backing).toBe(MEDALLION_BACKING_PATH);
    expect(outline).toBe(MEDALLION_OUTLINE_PATH);
  });

  it('hides the decorative svg from assistive tech', () => {
    render(<AyahMedallion n={3} />);
    expect(document.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });
});
