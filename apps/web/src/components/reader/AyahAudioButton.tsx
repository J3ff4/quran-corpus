'use client';

import type { Ayah } from '@quran-corpus/data';

interface AyahAudioButtonProps {
  ayah: Ayah;
  isThisPlaying: boolean;
  isPlaying: boolean;
  isRepeat: boolean;
  onPlay: () => void;
  onPause: () => void;
  onToggleRepeat: () => void;
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <polygon points="2,1 11,6 2,11" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
      <rect x="2" y="1" width="3" height="10" rx="1" />
      <rect x="7" y="1" width="3" height="10" rx="1" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        d="M2 4h8M8 2l2 2-2 2M10 8H2M4 6l-2 2 2 2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AyahAudioButton({
  ayah,
  isThisPlaying,
  isPlaying,
  isRepeat,
  onPlay,
  onPause,
  onToggleRepeat,
}: AyahAudioButtonProps) {
  const showPause = isThisPlaying && isPlaying;

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={showPause ? 'Pause' : `Play ayah ${ayah.ayah_number}`}
        onClick={showPause ? onPause : onPlay}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-paper-200 text-paper-600 transition-colors hover:bg-paper-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-paper-500 dark:bg-night-100 dark:text-paper-400 dark:hover:bg-night-50"
      >
        {showPause ? <PauseIcon /> : <PlayIcon />}
      </button>

      {isThisPlaying && (
        <button
          type="button"
          aria-label={isRepeat ? 'Repeat on' : 'Repeat off'}
          onClick={onToggleRepeat}
          className={[
            'flex h-6 w-6 items-center justify-center rounded-full text-paper-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-paper-500 dark:text-paper-400',
            isRepeat
              ? 'bg-paper-200 dark:bg-night-50'
              : 'bg-paper-100 hover:bg-paper-200 dark:bg-night-200 dark:hover:bg-night-100',
          ].join(' ')}
        >
          <RepeatIcon />
        </button>
      )}
    </div>
  );
}
