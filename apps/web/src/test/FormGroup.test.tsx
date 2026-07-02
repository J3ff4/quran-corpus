import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FormGroup } from '../components/dictionary/FormGroup';
import type { RootForm } from '@quran-corpus/data';

const form: RootForm = {
  id: 1,
  root_id: 1,
  sort_order: 0,
  pos_label: 'Noun',
  form_arabic: 'كِتَٰب',
  form_translit: 'kitāb',
  gloss: 'book',
  occurrence_count: 260,
};

describe('FormGroup', () => {
  it('renders pos label, form, count', () => {
    render(<FormGroup form={form} />);
    expect(screen.getByText('Noun')).toBeInTheDocument();
    expect(screen.getByText('كِتَٰب')).toBeInTheDocument();
    expect(screen.getByText(/260/)).toBeInTheDocument();
  });
});
