import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DictionarySearch } from '../components/dictionary/DictionarySearch';

describe('DictionarySearch', () => {
  it('renders a labelled search input', () => {
    render(<DictionarySearch />);
    expect(screen.getByRole('searchbox', { name: /search/i })).toBeInTheDocument();
  });
  it('submits to /dictionary via GET', () => {
    render(<DictionarySearch />);
    const form = screen.getByRole('search');
    expect(form).toHaveAttribute('action', '/dictionary');
  });
  it('prefills defaultValue', () => {
    render(<DictionarySearch defaultValue="ktb" />);
    expect(screen.getByRole('searchbox')).toHaveValue('ktb');
  });
});
