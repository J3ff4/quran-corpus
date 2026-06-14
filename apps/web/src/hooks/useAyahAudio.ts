'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Ayah } from '@quran-corpus/data';

function ayahAudioUrl(surahId: number, ayahNumber: number): string {
  const s = String(surahId).padStart(3, '0');
  const a = String(ayahNumber).padStart(3, '0');
  return `https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/${s}${a}.mp3`;
}

export interface AyahAudioState {
  playingAyahId: number | null;
  isPlaying: boolean;
  isRepeat: boolean;
  play: (ayah: Ayah) => void;
  pause: () => void;
  toggleRepeat: () => void;
}

export function useAyahAudio(ayahs: Ayah[]): AyahAudioState {
  const audioRef = useRef<InstanceType<typeof Audio> | null>(null);
  const [playingAyahId, setPlayingAyahId] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);

  // Mutable refs so event handlers never capture stale closure values
  const playingAyahIdRef = useRef<number | null>(null);
  const isRepeatRef = useRef(false);
  const ayahsRef = useRef(ayahs);

  useEffect(() => { ayahsRef.current = ayahs; }, [ayahs]);
  useEffect(() => { isRepeatRef.current = isRepeat; }, [isRepeat]);
  useEffect(() => { playingAyahIdRef.current = playingAyahId; }, [playingAyahId]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    audio.onended = () => {
      if (isRepeatRef.current) {
        audio.currentTime = 0;
        audio.play().catch(console.error);
        return;
      }
      const list = ayahsRef.current;
      const idx = list.findIndex((a) => a.id === playingAyahIdRef.current);
      if (idx !== -1 && idx < list.length - 1) {
        const next = list[idx + 1];
        audio.src = ayahAudioUrl(next.surah_id, next.ayah_number);
        setPlayingAyahId(next.id);
        audio.play().catch(console.error);
      } else {
        setIsPlaying(false);
      }
    };

    audio.onerror = () => {
      console.error('[useAyahAudio] playback error');
      setIsPlaying(false);
    };

    return () => {
      audio.pause();
      audio.src = '';
      audio.onended = null;
      audio.onerror = null;
    };
  }, []);

  const play = useCallback((ayah: Ayah) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingAyahIdRef.current !== ayah.id) {
      audio.src = ayahAudioUrl(ayah.surah_id, ayah.ayah_number);
      setPlayingAyahId(ayah.id);
    }
    audio.play().then(() => setIsPlaying(true)).catch(console.error);
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setIsPlaying(false);
  }, []);

  const toggleRepeat = useCallback(() => setIsRepeat((prev) => !prev), []);

  return { playingAyahId, isPlaying, isRepeat, play, pause, toggleRepeat };
}
