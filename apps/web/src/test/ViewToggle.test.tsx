import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ViewToggle } from '../components/wbw/ViewToggle';

describe('ViewToggle', () => {
  it('renders both options with the current mode pressed', () => {
    render(<ViewToggle mode="card" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onChange with the other mode when clicked', () => {
    const onChange = vi.fn();
    render(<ViewToggle mode="card" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(onChange).toHaveBeenCalledWith('list');
  });

  it('reflects list as the pressed mode when passed', () => {
    render(<ViewToggle mode="list" onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'false');
  });
});
