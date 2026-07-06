import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AlphabetGrid } from '../components/dictionary/AlphabetGrid';

describe('AlphabetGrid', () => {
  it('present letters are buttons calling onSelect; empty letters are disabled', () => {
    const onSelect = vi.fn();
    render(<AlphabetGrid counts={{ ب: 3 }} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'ب' }));
    expect(onSelect).toHaveBeenCalledWith('ب');
    expect(screen.queryByRole('button', { name: 'ء' })).toBeNull();
    expect(screen.getByText('ء')).toHaveAttribute('aria-disabled', 'true');
  });
  it('marks the active letter with aria-current', () => {
    render(<AlphabetGrid counts={{ ب: 3 }} activeLetter="ب" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'ب' })).toHaveAttribute('aria-current', 'true');
  });
});
