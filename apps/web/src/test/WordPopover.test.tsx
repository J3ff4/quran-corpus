import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WordPopover } from '../components/reader/WordPopover';
import type { Word } from '@quran-corpus/data';

// Framer Motion needs RAF
beforeAll(() => {
  global.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  };
});

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

const word: Word = {
  id: 1,
  ayah_id: 1,
  position: 1,
  text_arabic: 'بِسْمِ',
  transliteration: 'bismi',
  root: 'س م و',
  lemma: null,
  pos_tag: 'P',
  morphology_json: '["P","N"]',
};

describe('WordPopover', () => {
  it('renders nothing when word is null', () => {
    render(<WordPopover word={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders Arabic word text when open', () => {
    render(<WordPopover word={word} onClose={vi.fn()} />);
    expect(screen.getByText('بِسْمِ')).toBeInTheDocument();
  });

  it('renders transliteration', () => {
    render(<WordPopover word={word} onClose={vi.fn()} />);
    expect(screen.getByText('bismi')).toBeInTheDocument();
  });

  it('renders POS tag', () => {
    render(<WordPopover word={word} onClose={vi.fn()} />);
    // 'P' appears as both pos_tag badge and morphology segment; verify at least one is present
    expect(screen.getAllByText('P').length).toBeGreaterThanOrEqual(1);
  });

  it('renders root when present', () => {
    render(<WordPopover word={word} onClose={vi.fn()} />);
    expect(screen.getByText('س م و')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<WordPopover word={word} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<WordPopover word={word} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('popover-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders dialog role', () => {
    render(<WordPopover word={word} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
