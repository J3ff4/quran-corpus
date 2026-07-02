import type { ConcordanceEntry } from '@quran-corpus/data';
import { wordHref } from './wordLocation';

export const verseRef = (e: ConcordanceEntry): string =>
  `${e.surah_id}:${e.ayah_number}:${e.position}`;

export const concordanceHref = (e: ConcordanceEntry): string =>
  wordHref({ surah: e.surah_id, ayah: e.ayah_number, position: e.position });
