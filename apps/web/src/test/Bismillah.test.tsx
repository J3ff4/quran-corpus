import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Bismillah } from '../components/reader/ornaments/Bismillah';

describe('Bismillah', () => {
  it('shows bismillah for a normal surah', () => {
    render(<Bismillah surahId={2} />);
    expect(screen.getByText(/بِسْمِ/)).toBeInTheDocument();
  });

  it('hides bismillah for Fatiha (1) and At-Tawba (9)', () => {
    const { container: c1 } = render(<Bismillah surahId={1} />);
    const { container: c9 } = render(<Bismillah surahId={9} />);
    expect(c1).toBeEmptyDOMElement();
    expect(c9).toBeEmptyDOMElement();
  });
});
