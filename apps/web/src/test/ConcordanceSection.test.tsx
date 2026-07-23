import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConcordanceSection } from '../components/dictionary/ConcordanceSection';
import type { RootForm, ConcordanceEntry } from '@quran-corpus/data';

const forms: RootForm[] = [
  {
    id: 1, root_id: 1, sort_order: 0, pos_label: 'Form I verb',
    form_arabic: 'غَفَرَ', form_translit: 'ghafara', gloss: null, occurrence_count: 1,
  },
];

const entries: ConcordanceEntry[] = [
  {
    surah_id: 2, ayah_number: 58, position: 16, word_id: 500,
    // ponytail: header text_arabic deliberately distinct from verse_words'
    // text (matches the precedent in ConcordanceList.test.tsx's entry()
    // helper) -- ConcordanceList renders the matched word both in the row
    // header AND highlighted inside the verse body, so identical text in
    // both places makes getByText ambiguous (multiple matches), not broken.
    text_arabic: 'HEAD', transliteration: 'naghfir', gloss: 'We will forgive',
    form_id: 1, verse_words: [{ id: 500, position: 16, text_arabic: 'نَغْفِرْ' }],
  },
];

describe('ConcordanceSection', () => {
  it('renders the chips and the concordance list together', () => {
    render(
      <ConcordanceSection forms={forms} initialConcordance={entries} total={1} rootBw="gfr" />,
    );
    expect(screen.getByText('Form I verb')).toBeInTheDocument();
    expect(screen.getByText('نَغْفِرْ')).toBeInTheDocument();
  });

  it('clicking a chip selects it (aria-pressed) without crashing, no forms= fetch needed here', async () => {
    render(
      <ConcordanceSection forms={forms} initialConcordance={entries} total={1} rootBw="gfr" />,
    );
    const chip = screen.getByRole('button', { name: /ghafara/i });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking a selected chip again deselects it (back to All)', async () => {
    render(
      <ConcordanceSection forms={forms} initialConcordance={entries} total={1} rootBw="gfr" />,
    );
    const chip = screen.getByRole('button', { name: /ghafara/i });
    await userEvent.click(chip);
    await userEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders nothing for the chip row when there are no forms, list still shows', () => {
    render(<ConcordanceSection forms={[]} initialConcordance={entries} total={1} rootBw="gfr" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('نَغْفِرْ')).toBeInTheDocument();
  });
});
