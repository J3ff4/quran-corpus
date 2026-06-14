# Phase 05: Language Switcher + Audio Recitation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the language switcher with a Framer Motion sliding pill animation, and add per-ayah audio recitation with auto-advance and repeat.

**Architecture:** `LanguageBar` becomes a client component using `useRouter` + Framer Motion `layoutId`. Audio is owned by a `useAyahAudio` hook in `ReaderView` — a single `<audio>` element, hook manages state, `AyahAudioButton` renders inline controls per ayah.

**Tech Stack:** Next.js 15 App Router, Framer Motion, Vitest + React Testing Library

---

## 1. Language Switcher

### Component: `LanguageBar` (rewrite)

**File:** `apps/web/src/components/reader/LanguageBar.tsx`

Add `'use client'`. Replace `Link` with `motion.button` + `useRouter().push()`. The active background is a `motion.div` with `layoutId="lang-pill"` rendered inside the active button — Framer Motion animates it sliding between positions when active lang changes.

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

// Per button:
// <button className="relative px-3 py-1 text-xs">
//   {isActive && (
//     <motion.div
//       layoutId="lang-pill"
//       className="absolute inset-0 rounded-full bg-paper-900 dark:bg-paper-100"
//       transition={{ type: 'spring', stiffness: 400, damping: 30 }}
//     />
//   )}
//   <span className={cn('relative z-10', isActive ? 'text-paper-50 dark:text-paper-900' : 'text-paper-600 dark:text-paper-400')}>
//     {label}
//   </span>
// </button>
```

- Navigation: `router.push(`/surah/${surahId}?lang=${code}`)` — same URL shape as before
- No loading state needed; Next.js handles the transition
- `prefers-reduced-motion`: wrap `layoutId` div in `AnimatePresence` and pass `layout` only when motion is not reduced (check via `useReducedMotion()`)

**Languages:** English · Uzbek · Russian (same three as current; `ar` excluded — UI is not yet Arabic-locale)

---

## 2. Audio Recitation

### Hook: `useAyahAudio`

**File:** `apps/web/src/hooks/useAyahAudio.ts`

Owns a single `HTMLAudioElement` ref. Consumers call `play(ayah)` / `pause()` / `toggleRepeat()`.

```ts
interface AyahAudioState {
  playingAyahId: number | null;
  isPlaying: boolean;
  isRepeat: boolean;
  play: (ayah: Ayah) => void;
  pause: () => void;
  toggleRepeat: () => void;
  audioRef: RefObject<HTMLAudioElement>;
}
```

**URL formula** (no DB storage — computed on the fly):
```
https://everyayah.com/data/Abdul_Basit_Murattal_64kbps/{surah3}{ayah3}.mp3
// surah_id and ayah_number both zero-padded to 3 digits
// Example: surah 1 ayah 7 → 001007.mp3
```

**`onended` logic:**
1. If `isRepeat`: replay same ayah (reset `currentTime`, call `play()`)
2. Else: find next ayah in `ayahs[]` by index; if found, call `play(nextAyah)`; if last ayah, stop (`isPlaying → false`)

**`play(ayah)` logic:**
- If `playingAyahId !== ayah.id`: set `audio.src` to new URL, set `playingAyahId`, call `audio.play()`
- If same ayah and paused: call `audio.play()`, set `isPlaying = true`

**Error handling:** `audio.onerror` → set `isPlaying = false`, log to console (no user-facing toast for v1)

**`ayahs` parameter:** passed in from `ReaderView` so the hook knows the ordered list for auto-advance.

---

### Component: `AyahAudioButton`

**File:** `apps/web/src/components/reader/AyahAudioButton.tsx`

Client component. Renders two icon buttons in the ayah header row (next to the ayah number badge):

1. **Play/pause button** — always visible. Shows `▶` (play) or `⏸` (pause) depending on `isThisPlaying && isPlaying`. Aria-label: "Play ayah {ayah_number}" / "Pause".
2. **Repeat button** — visible only when `isThisPlaying` (this ayah is the active one). Highlighted (`bg-paper-200`) when `isRepeat` is on. Aria-label: "Repeat on" / "Repeat off".

Props:
```ts
interface AyahAudioButtonProps {
  ayah: Ayah;
  isThisPlaying: boolean; // playingAyahId === ayah.id
  isPlaying: boolean;
  isRepeat: boolean;
  onPlay: () => void;
  onPause: () => void;
  onToggleRepeat: () => void;
}
```

Uses SVG icons (inline, no icon library dependency). No Framer Motion animation on the button itself — keep it simple.

---

### Modified: `AyahView`

**File:** `apps/web/src/components/reader/AyahView.tsx`

Add `AyahAudioButton` to the header row (the `div` that currently holds the ayah number badge). New props:

```ts
isThisPlaying: boolean;
isPlaying: boolean;
isRepeat: boolean;
onPlay: () => void;
onPause: () => void;
onToggleRepeat: () => void;
```

Header row layout: `[badge] [AyahAudioButton]` — badge left, audio controls right of it.

---

### Modified: `ReaderView`

**File:** `apps/web/src/components/reader/ReaderView.tsx`

- Add `useAyahAudio(ayahs)` call
- Add `<audio ref={audioRef} />` (hidden, no controls attribute)
- Pass audio props to each `AyahView`:
  ```tsx
  isThisPlaying={playingAyahId === ayah.id}
  isPlaying={isPlaying}
  isRepeat={isRepeat}
  onPlay={() => play(ayah)}
  onPause={pause}
  onToggleRepeat={toggleRepeat}
  ```

---

## 3. Testing

### `LanguageBar.test.tsx`
- Renders English, Uzbek, Russian buttons
- Active language button has the pill background element present in DOM
- Clicking inactive language calls `router.push` with correct URL

### `AyahAudioButton.test.tsx`
- Play button renders with aria-label containing ayah number
- Shows pause icon when `isThisPlaying && isPlaying`
- Repeat button absent when `isThisPlaying` is false
- Repeat button present and highlighted when `isThisPlaying && isRepeat`
- `onPlay` called on play button click
- `onToggleRepeat` called on repeat button click

### `useAyahAudio.test.ts`
- `play(ayah)` sets `playingAyahId` and `isPlaying`
- `pause()` sets `isPlaying = false`
- `onended` with `isRepeat = false` advances to next ayah
- `onended` with `isRepeat = true` replays same ayah (src unchanged, play called)
- `onended` on last ayah stops (no advance, `isPlaying = false`)
- `toggleRepeat` flips `isRepeat`

---

## 4. Constraints & Notes

- `LanguageBar` must remain a client component after this change — do not revert
- `AyahAudioButton` is client-only; `AyahView` becomes a client component (or wrap button in its own client boundary)
- CSP: `media-src 'self' https:` already allows any HTTPS audio source — no CSP change needed for EveryAyah.com
- `prefers-reduced-motion`: `useReducedMotion()` from Framer Motion; if true, skip `layoutId` on lang pill
- `AyahView` is rendered by `ReaderView` (`'use client'`), so it runs on the client without needing its own directive; `AyahAudioButton` is a client component imported by `AyahView` — no extra boundary required
- No `audio_url` column writes needed — URL computed entirely in the hook
- Scraper still running in background; words table populates incrementally — audio/language features are independent of word morphology data
