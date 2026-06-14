import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageBar } from '../components/reader/LanguageBar';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
  useReducedMotion: () => false,
}));

describe('LanguageBar', () => {
  beforeEach(() => mockPush.mockClear());

  it('renders English, Uzbek, Russian buttons', () => {
    render(<LanguageBar surahId={1} activeLang="en" />);
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Uzbek' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Russian' })).toBeInTheDocument();
  });

  it('renders active pill element inside the active language button', () => {
    render(<LanguageBar surahId={1} activeLang="uz" />);
    const uzbekBtn = screen.getByRole('button', { name: 'Uzbek' });
    expect(uzbekBtn.querySelector('[data-testid="lang-pill"]')).toBeInTheDocument();
  });

  it('does not render pill inside inactive language buttons', () => {
    render(<LanguageBar surahId={1} activeLang="uz" />);
    const enBtn = screen.getByRole('button', { name: 'English' });
    expect(enBtn.querySelector('[data-testid="lang-pill"]')).toBeNull();
  });

  it('clicking inactive language calls router.push with correct URL', () => {
    render(<LanguageBar surahId={3} activeLang="en" />);
    fireEvent.click(screen.getByRole('button', { name: 'Russian' }));
    expect(mockPush).toHaveBeenCalledWith('/surah/3?lang=ru');
  });

  it('clicking active language does not navigate', () => {
    render(<LanguageBar surahId={1} activeLang="en" />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(mockPush).not.toHaveBeenCalled();
  });
});
