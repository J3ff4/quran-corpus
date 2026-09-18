import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

import { VersePicker } from '../components/wbw/VersePicker';

const surahs = [
  { id: 1, name: 'Al-Fatihah', ayah_count: 7 },
  { id: 2, name: 'Al-Baqarah', ayah_count: 286 },
];

describe('VersePicker', () => {
  beforeEach(() => mockPush.mockClear());

  it('labels each option with the localized name it was handed', () => {
    render(<VersePicker surahs={[{ id: 1, name: 'Fotiha', ayah_count: 7 }]} />);
    expect(screen.getByRole('option', { name: '1. Fotiha' })).toBeInTheDocument();
  });

  it('ayah options track the selected surah count', () => {
    render(<VersePicker surahs={surahs} />);
    const ayahSelect = screen.getByLabelText(/ayah/i);
    expect(within(ayahSelect).getAllByRole('option')).toHaveLength(7); // Fatihah default
    fireEvent.change(screen.getByLabelText(/surah/i), { target: { value: '2' } });
    expect(within(ayahSelect).getAllByRole('option')).toHaveLength(286);
  });

  it('Go pushes /surah/[id]/words?ayah=N', () => {
    render(<VersePicker surahs={surahs} />);
    fireEvent.change(screen.getByLabelText(/surah/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/ayah/i), { target: { value: '255' } });
    fireEvent.click(screen.getByRole('button', { name: /go/i }));
    expect(mockPush).toHaveBeenCalledWith('/surah/2/words?ayah=255');
  });

  it('resets ayah to 1 when the surah changes', () => {
    render(<VersePicker surahs={surahs} />);
    fireEvent.change(screen.getByLabelText(/surah/i), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/ayah/i), { target: { value: '255' } });
    fireEvent.change(screen.getByLabelText(/surah/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /go/i }));
    expect(mockPush).toHaveBeenCalledWith('/surah/1/words?ayah=1');
  });

  it('calls onNavigate after pushing, so a hosting sheet can close', () => {
    const onNavigate = vi.fn();
    render(<VersePicker surahs={surahs} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: /go/i }));
    expect(mockPush).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalled();
  });
});
