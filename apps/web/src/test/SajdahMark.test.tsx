import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SajdahMark } from '../components/reader/ornaments/SajdahMark';

describe('SajdahMark', () => {
  it('renders the sajdah glyph with an a11y label', () => {
    render(<SajdahMark />);
    expect(screen.getByLabelText('Verse of Prostration (Sajdah)')).toBeInTheDocument();
    expect(screen.getByText('۩')).toBeInTheDocument();
  });

  it('merges an extra className', () => {
    render(<SajdahMark className="ml-1" />);
    expect(screen.getByLabelText('Verse of Prostration (Sajdah)')).toHaveClass('ml-1');
  });
});
