import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AyahMedallion } from '../components/reader/ornaments/AyahMedallion';

describe('AyahMedallion', () => {
  it('renders ayah number inside an ornamental medallion with a11y label', () => {
    render(<AyahMedallion n={7} />);
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByLabelText('Ayah 7')).toBeInTheDocument();
  });

  it('hides the decorative svg from assistive tech', () => {
    render(<AyahMedallion n={3} />);
    expect(document.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
  });
});
