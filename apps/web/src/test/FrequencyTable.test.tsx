import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FrequencyTable } from '../components/dictionary/FrequencyTable';

describe('FrequencyTable', () => {
  it('renders ranked rows with counts', () => {
    render(
      <FrequencyTable
        caption="Lemma Frequency"
        rows={[
          { label: 'ٱللَّه', count: 2699 },
          { label: 'رَبّ', count: 970 },
        ]}
      />,
    );
    expect(screen.getByText('ٱللَّه')).toBeInTheDocument();
    expect(screen.getByText(/2699/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /lemma frequency/i })).toBeInTheDocument();
  });
});
