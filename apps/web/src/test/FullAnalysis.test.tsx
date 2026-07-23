import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FullAnalysis } from '../components/morphology/FullAnalysis';

// vitest hoists vi.mock above imports, so the framer stub is applied before
// FullAnalysis loads — the collapsible renders synchronously in tests.
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      children,
      initial: _i,
      animate: _a,
      exit: _e,
      transition: _t,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children?: ReactNode;
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
    }) => <div {...props}>{children}</div>,
  },
  useReducedMotion: () => false,
}));

describe('FullAnalysis', () => {
  it('renders nothing when both fields absent', () => {
    const { container } = render(<FullAnalysis />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is collapsed by default (content hidden), expands on click', () => {
    render(<FullAnalysis description="It is a genitive noun." />);
    expect(screen.queryByText('It is a genitive noun.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /full analysis/i }));
    expect(screen.getByText('It is a genitive noun.')).toBeInTheDocument();
  });

  it('toggle button exposes aria-expanded state', () => {
    render(<FullAnalysis description="x" />);
    const btn = screen.getByRole('button', { name: /full analysis/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders Arabic grammar RTL when expanded', () => {
    render(<FullAnalysis grammarNote="اسم مجرور" />);
    fireEvent.click(screen.getByRole('button', { name: /full analysis/i }));
    const ar = screen.getByText('اسم مجرور');
    expect(ar).toHaveAttribute('dir', 'rtl');
  });

  it('renders one line per \\n-separated clause', () => {
    render(<FullAnalysis grammarNote={'مجرور\nعلم'} />);
    fireEvent.click(screen.getByRole('button', { name: /full analysis/i }));
    expect(screen.getByText('مجرور')).toBeInTheDocument();
    expect(screen.getByText('علم')).toBeInTheDocument();
  });
});
