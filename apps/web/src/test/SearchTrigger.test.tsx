import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchTrigger } from '../components/search/SearchTrigger';

describe('SearchTrigger', () => {
  it('shows a search button and opens the sheet on click', () => {
    render(<SearchTrigger />);
    const btn = screen.getByRole('button', { name: /search/i });
    expect(btn).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /search/i })).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByRole('dialog', { name: /search/i })).toBeInTheDocument();
  });
});
