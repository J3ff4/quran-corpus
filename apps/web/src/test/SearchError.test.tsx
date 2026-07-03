import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchError from '../app/search/error';

describe('SearchError', () => {
  it('renders a fallback without leaking the error and retries via reset', () => {
    const reset = vi.fn();
    render(<SearchError error={new Error('libsql connection refused')} reset={reset} />);
    expect(screen.getByRole('heading', { name: /search/i })).toBeInTheDocument();
    expect(screen.queryByText(/libsql/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalled();
  });
});
