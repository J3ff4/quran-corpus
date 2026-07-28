import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormFilterChips } from '../components/dictionary/FormFilterChips';
import type { RootForm } from '@quran-corpus/data';

const forms: RootForm[] = [
  {
    id: 1, root_id: 1, sort_order: 0, pos_label: 'Form I verb',
    form_arabic: 'غَفَرَ', form_translit: 'ghafara', gloss: null, occurrence_count: 65,
  },
  {
    id: 2, root_id: 1, sort_order: 1, pos_label: 'Nominal',
    form_arabic: 'غَفُور', form_translit: 'ghafūr', gloss: 'Oft-Forgiving', occurrence_count: 91,
  },
];

describe('FormFilterChips', () => {
  it('renders one button per form with its label, arabic, translit, gloss, count', () => {
    render(<FormFilterChips forms={forms} selected={[]} onToggle={vi.fn()} />);
    expect(screen.getByText('Form I verb')).toBeInTheDocument();
    expect(screen.getByText('غَفَرَ')).toBeInTheDocument();
    expect(screen.getByText('ghafara')).toBeInTheDocument();
    expect(screen.getByText('Oft-Forgiving')).toBeInTheDocument();
    expect(screen.getByText('91')).toBeInTheDocument();
  });

  it('aria-pressed reflects the selected set', () => {
    render(<FormFilterChips forms={forms} selected={[2]} onToggle={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    const ghafara = buttons.find((b) => b.textContent?.includes('ghafara'))!;
    const ghafur = buttons.find((b) => b.textContent?.includes('ghafūr'))!;
    expect(ghafara).toHaveAttribute('aria-pressed', 'false');
    expect(ghafur).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onToggle with the form id when clicked', async () => {
    const onToggle = vi.fn();
    render(<FormFilterChips forms={forms} selected={[]} onToggle={onToggle} />);
    await userEvent.click(screen.getByText('ghafara'));
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it('renders nothing when forms is empty', () => {
    const { container } = render(<FormFilterChips forms={[]} selected={[]} onToggle={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a chip for a root with only one derived form', () => {
    // 712 roots have exactly one form (Phase 17). The chip is informational --
    // it names the form even though filtering by the only option is a no-op --
    // so it must render rather than be hidden as a useless control.
    const single: RootForm[] = [
      {
        id: 1, root_id: 1, sort_order: 0, pos_label: 'Noun',
        form_arabic: 'أَرْض', form_translit: 'arḍ', gloss: null,
        occurrence_count: 461,
      },
    ];

    render(<FormFilterChips forms={single} selected={[]} onToggle={vi.fn()} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('Noun')).toBeInTheDocument();
    expect(screen.getByText('أَرْض')).toBeInTheDocument();
    expect(screen.getByText('461')).toBeInTheDocument();
  });
});
