import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AyahAudioButton } from '../components/reader/AyahAudioButton';
import type { Ayah } from '@quran-corpus/data';

const ayah: Ayah = {
  id: 5,
  surah_id: 1,
  ayah_number: 5,
  text_uthmani: 'إِيَّاكَ',
  text_simple: null,
  juz: 1,
  page: 1,
  audio_url: null,
};

const baseProps = {
  ayah,
  isThisPlaying: false,
  isPlaying: false,
  isRepeat: false,
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onToggleRepeat: vi.fn(),
};

describe('AyahAudioButton', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders a play button with ayah number in aria-label', () => {
    render(<AyahAudioButton {...baseProps} />);
    expect(screen.getByRole('button', { name: /play ayah 5/i })).toBeInTheDocument();
  });

  it('shows pause icon and aria-label when this ayah is playing', () => {
    render(<AyahAudioButton {...baseProps} isThisPlaying isPlaying />);
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
  });

  it('calls onPlay when play button is clicked', () => {
    const onPlay = vi.fn();
    render(<AyahAudioButton {...baseProps} onPlay={onPlay} />);
    fireEvent.click(screen.getByRole('button', { name: /play ayah 5/i }));
    expect(onPlay).toHaveBeenCalledOnce();
  });

  it('calls onPause when pause button is clicked', () => {
    const onPause = vi.fn();
    render(<AyahAudioButton {...baseProps} isThisPlaying isPlaying onPause={onPause} />);
    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(onPause).toHaveBeenCalledOnce();
  });

  it('does not render repeat button when this ayah is not active', () => {
    render(<AyahAudioButton {...baseProps} isThisPlaying={false} />);
    expect(screen.queryByRole('button', { name: /repeat/i })).toBeNull();
  });

  it('renders repeat button when this ayah is active', () => {
    render(<AyahAudioButton {...baseProps} isThisPlaying />);
    expect(screen.getByRole('button', { name: /repeat/i })).toBeInTheDocument();
  });

  it('repeat button shows active style when isRepeat=true', () => {
    render(<AyahAudioButton {...baseProps} isThisPlaying isRepeat />);
    const repeatBtn = screen.getByRole('button', { name: /repeat on/i });
    expect(repeatBtn).toHaveClass('bg-paper-200');
  });

  it('calls onToggleRepeat when repeat button is clicked', () => {
    const onToggleRepeat = vi.fn();
    render(<AyahAudioButton {...baseProps} isThisPlaying onToggleRepeat={onToggleRepeat} />);
    fireEvent.click(screen.getByRole('button', { name: /repeat/i }));
    expect(onToggleRepeat).toHaveBeenCalledOnce();
  });
});
