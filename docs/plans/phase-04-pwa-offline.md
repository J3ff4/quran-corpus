# Phase 04 — PWA + Offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Quran Corpus web app installable as a PWA with offline support for previously-visited surah pages via a cache-on-navigate service worker.

**Architecture:** `@serwist/next` wraps `next.config.ts` to compile `src/sw.ts` → `public/sw.js` at build time. The SW precaches Next.js static chunks at install and applies NetworkFirst (7-day TTL) for navigation pages, serving `/offline` as a fallback when network fails and no cache entry exists. Icons are generated from an SVG source via `sharp` and committed to git. The manifest moves from a static `public/manifest.json` to a typed `src/app/manifest.ts` Next.js route.

**Tech Stack:** Next.js 15 App Router, TypeScript, `@serwist/next` + `serwist` (^9.0.0), `sharp` (^0.33.0, dev-only), `tsx` (dev-only), Vitest + React Testing Library

**Design spec:** `docs/superpowers/specs/2026-06-13-pwa-offline-design.md`

---

## File Map

```
apps/web/
  package.json                      MODIFY — add @serwist/next, serwist
  next.config.ts                    MODIFY — wrap with withSerwist(); add worker-src 'self' to CSP
  src/sw.ts                         CREATE — SW entry: precache + NetworkFirst + offline fallback
  src/app/
    manifest.ts                     CREATE — typed manifest (replaces public/manifest.json)
    offline/
      page.tsx                      CREATE — offline fallback page
  src/test/
    offline.test.tsx                CREATE — component test for offline page
    manifest.test.ts                CREATE — manifest fields snapshot test
  public/
    manifest.json                   DELETE — replaced by manifest.ts
    icons/
      icon-192.png                  REPLACE — generated from SVG (ق on paper bg)
      icon-512.png                  REPLACE — generated from SVG
      icon-maskable-192.png         CREATE — maskable variant (padded safe zone)
      apple-touch-icon.png          CREATE — 180×180 iOS icon

scripts/
  generate-icons.ts                 CREATE — SVG→PNG pipeline via sharp (run from repo root)

package.json (root)                 MODIFY — add sharp, tsx to devDependencies
```

---

## Task 1: Install dependencies

**Files:**
- Modify: `apps/web/package.json`
- Modify: `package.json` (root)

- [ ] **Step 1: Add Serwist to web app**

Edit `apps/web/package.json` — add to `"dependencies"`:

```json
"@serwist/next": "^9.0.0",
"serwist": "^9.0.0"
```

- [ ] **Step 2: Add sharp + tsx to root devDependencies**

Edit root `package.json` — add to `"devDependencies"`:

```json
"sharp": "^0.33.0",
"tsx": "^4.0.0"
```

- [ ] **Step 3: Install**

Run from repo root:
```bash
pnpm install
```

Expected: lockfile updated, no errors.

- [ ] **Step 4: Verify existing tests still pass**

```bash
pnpm test
```

Expected: all tests pass (no regressions from dep install).

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json package.json pnpm-lock.yaml
git commit -m "chore(web): add @serwist/next, serwist; add sharp + tsx for icon gen"
```

---

## Task 2: Icon generation script + assets

**Files:**
- Create: `scripts/generate-icons.ts`
- Replace: `apps/web/public/icons/icon-192.png`
- Replace: `apps/web/public/icons/icon-512.png`
- Create: `apps/web/public/icons/icon-maskable-192.png`
- Create: `apps/web/public/icons/apple-touch-icon.png`

**Note:** Run this script from the **repo root** so `OUTPUT_DIR` resolves correctly.

- [ ] **Step 1: Create icon generation script**

Create `scripts/generate-icons.ts`:

```typescript
import sharp from 'sharp';
import path from 'path';

const OUTPUT_DIR = path.resolve('apps/web/public/icons');
const BG = '#faf8f3';
const FG = '#1f1a14';

interface SvgOptions {
  padFactor?: number;
  rounded?: boolean;
}

function makeSvg(size: number, { padFactor = 0, rounded = true }: SvgOptions = {}): string {
  const padding = size * padFactor;
  const fontSize = (size - padding * 2) * 0.65;
  const cx = size / 2;
  const cy = size / 2;
  const rx = rounded ? Math.round(size * 0.22) : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${BG}" rx="${rx}"/>
  <text
    x="${cx}" y="${cy}"
    font-family="Amiri, serif"
    font-size="${fontSize}"
    fill="${FG}"
    text-anchor="middle"
    dominant-baseline="middle"
  >ق</text>
</svg>`;
}

async function generate(svg: string, outPath: string): Promise<void> {
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log(`Generated ${outPath}`);
}

async function main(): Promise<void> {
  await generate(makeSvg(512), `${OUTPUT_DIR}/icon-512.png`);
  await generate(makeSvg(192), `${OUTPUT_DIR}/icon-192.png`);
  await generate(makeSvg(192, { padFactor: 0.12, rounded: false }), `${OUTPUT_DIR}/icon-maskable-192.png`);
  await generate(makeSvg(180), `${OUTPUT_DIR}/apple-touch-icon.png`);
  console.log('All icons generated.');
}

main().catch(console.error);
```

- [ ] **Step 2: Run the script from repo root**

```bash
pnpm tsx scripts/generate-icons.ts
```

Expected output:
```
Generated /…/apps/web/public/icons/icon-512.png
Generated /…/apps/web/public/icons/icon-192.png
Generated /…/apps/web/public/icons/icon-maskable-192.png
Generated /…/apps/web/public/icons/apple-touch-icon.png
All icons generated.
```

- [ ] **Step 3: Verify files exist and have nonzero size**

```bash
ls -lh apps/web/public/icons/
```

Expected: four PNG files, each > 1 KB.

- [ ] **Step 4: Commit script and generated icons**

```bash
git add scripts/generate-icons.ts apps/web/public/icons/
git commit -m "feat(web): add icon generation script; generate PWA icon set (ق on paper bg)"
```

---

## Task 3: Offline fallback page

**Files:**
- Create: `apps/web/src/test/offline.test.tsx`
- Create: `apps/web/src/app/offline/page.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/test/offline.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OfflinePage from '../app/offline/page';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('OfflinePage', () => {
  it('renders a heading', () => {
    render(<OfflinePage />);
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();
  });

  it('renders a link back to the surah list', () => {
    render(<OfflinePage />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/surah');
  });

  it('communicates offline state in the message', () => {
    render(<OfflinePage />);
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/web && pnpm test -- offline.test
```

Expected: FAIL — `Cannot find module '../app/offline/page'`

- [ ] **Step 3: Create the offline page**

Create `apps/web/src/app/offline/page.tsx`:

```tsx
import Link from 'next/link';

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p dir="rtl" className="mb-6 font-arabic text-7xl text-paper-900 dark:text-paper-100" aria-hidden="true">
        ق
      </p>
      <h2 className="mb-2 text-2xl font-semibold text-paper-900 dark:text-paper-100">
        You&rsquo;re offline
      </h2>
      <p className="mb-8 max-w-xs text-paper-600 dark:text-paper-400">
        No internet connection. Surahs you&rsquo;ve visited before are still available.
      </p>
      <Link
        href="/surah"
        className="rounded-lg bg-paper-900 px-5 py-2.5 text-sm font-medium text-paper-50 transition-colors hover:bg-paper-700 dark:bg-paper-100 dark:text-night-300 dark:hover:bg-paper-200"
      >
        Browse cached surahs
      </Link>
    </main>
  );
}
```

- [ ] **Step 4: Run test — verify it passes**

```bash
cd apps/web && pnpm test -- offline.test
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/offline/ apps/web/src/test/offline.test.tsx
git commit -m "feat(web): add offline fallback page"
```

---

## Task 4: Typed manifest + layout metadata

**Files:**
- Create: `apps/web/src/test/manifest.test.ts`
- Create: `apps/web/src/app/manifest.ts`
- Delete: `apps/web/public/manifest.json`
- Modify: `apps/web/src/app/layout.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/test/manifest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import manifest from '../app/manifest';

describe('manifest', () => {
  it('has correct name and start_url', () => {
    const m = manifest();
    expect(m.name).toBe('Quran Corpus');
    expect(m.start_url).toBe('/surah');
    expect(m.display).toBe('standalone');
  });

  it('has separate any and maskable icon entries', () => {
    const m = manifest();
    const purposes = m.icons?.map((i) => i.purpose) ?? [];
    expect(purposes).toContain('any');
    expect(purposes).toContain('maskable');
  });

  it('does not combine maskable and any in a single entry', () => {
    const m = manifest();
    const combined = m.icons?.find((i) => i.purpose === 'maskable any');
    expect(combined).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

```bash
cd apps/web && pnpm test -- manifest.test
```

Expected: FAIL — `Cannot find module '../app/manifest'`

- [ ] **Step 3: Create manifest.ts**

Create `apps/web/src/app/manifest.ts`:

```typescript
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Quran Corpus',
    short_name: 'Quran',
    description: 'Word-by-word Quranic morphology, grammar, and translations',
    start_url: '/surah',
    display: 'standalone',
    background_color: '#faf8f3',
    theme_color: '#1f1a14',
    orientation: 'portrait',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
```

- [ ] **Step 4: Delete the old static manifest**

```bash
rm apps/web/public/manifest.json
```

- [ ] **Step 5: Update layout.tsx**

In `apps/web/src/app/layout.tsx`, replace the `metadata` export with:

```typescript
export const metadata: Metadata = {
  title: 'Quran Corpus',
  description: 'Word-by-word Quranic morphology, grammar, and translations',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Quran Corpus',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
};
```

(Remove `manifest: '/manifest.json'` — Next.js auto-injects `<link rel="manifest" href="/manifest.webmanifest">` when `app/manifest.ts` exists.)

- [ ] **Step 6: Run test — verify it passes**

```bash
cd apps/web && pnpm test -- manifest.test
```

Expected: PASS (3 tests)

**Note on screenshots:** The design spec lists two screenshot manifest entries. Screenshots are omitted from `manifest.ts` here — no screenshot assets exist yet and `MetadataRoute.Manifest` screenshot support varies by Next.js version. Add after the app has real data and screenshots can be captured.

- [ ] **Step 7: Run full test suite to verify no regressions**

```bash
cd apps/web && pnpm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/manifest.ts apps/web/src/app/layout.tsx apps/web/src/test/manifest.test.ts
git rm apps/web/public/manifest.json
git commit -m "feat(web): replace static manifest.json with typed app/manifest.ts; add apple-touch-icon metadata"
```

---

## Task 5: Service worker entry

**Files:**
- Create: `apps/web/src/sw.ts`

No unit tests — SW global API (`ServiceWorkerGlobalScope`, `self.__SW_MANIFEST`) is unavailable in jsdom. Correctness is verified via the manual checklist in Task 6.

- [ ] **Step 1: Create the SW entry file**

Create `apps/web/src/sw.ts`:

```typescript
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist, NetworkFirst, ExpirationPlugin } from 'serwist';

declare global {
  interface ServiceWorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Cache-on-navigate: NetworkFirst for all document requests (surah pages, list, etc.)
      matcher: ({ request }) => request.mode === 'navigate',
      handler: new NetworkFirst({
        cacheName: 'pages',
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 7 * 24 * 60 * 60 })],
        networkTimeoutSeconds: 3,
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
});

serwist.addEventListeners();
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/sw.ts
git commit -m "feat(web): add Serwist service worker with NetworkFirst navigation cache + offline fallback"
```

---

## Task 6: Wire up next.config.ts + CSP fix

**Files:**
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Update next.config.ts**

Replace the entire contents of `apps/web/next.config.ts` with:

```typescript
import withSerwist from '@serwist/next';
import type { NextConfig } from 'next';

const config: NextConfig = {
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=31536000; includeSubDomains',
        },
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "font-src 'self' data: https://fonts.gstatic.com",
            "connect-src 'self'",
            "media-src 'self' https:",
            "worker-src 'self'",
          ].join('; '),
        },
      ],
    },
  ],
};

export default withSerwist({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
})(config);
```

- [ ] **Step 2: Run type-check**

```bash
cd apps/web && pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
cd apps/web && pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/next.config.ts
git commit -m "feat(web): wire up @serwist/next plugin; add worker-src 'self' to CSP"
```

---

## Task 7: Build verification + manual checklist

**No file changes** — this task verifies the full PWA works end-to-end.

- [ ] **Step 1: Production build**

```bash
cd apps/web && pnpm build
```

Expected: build succeeds with no errors. Look for Serwist output lines such as:
```
[Serwist] sw.js generated.
```

- [ ] **Step 2: Start production server**

```bash
cd apps/web && pnpm start
```

Open `http://localhost:3000` in Chrome.

- [ ] **Step 3: Verify manifest**

Chrome DevTools → Application → Manifest.

Check:
- Name: `Quran Corpus`
- Start URL: `/surah`
- Icons: at least 3 entries, two separate `purpose` values (`any` / `maskable`)
- No console errors about missing icons

- [ ] **Step 4: Verify service worker**

Chrome DevTools → Application → Service Workers.

Check:
- Source: `sw.js`
- Status: `activated and is running`
- No errors in the SW console

- [ ] **Step 5: Test cache-on-navigate**

1. Navigate to `/surah/1`
2. DevTools → Network → tick **Offline**
3. Refresh or re-navigate to `/surah/1`

Expected: page loads from SW cache (status `(ServiceWorker)` in Network tab).

- [ ] **Step 6: Test offline fallback**

1. DevTools → Network → tick **Offline**
2. Navigate to a surah you have NOT visited (e.g., `/surah/114`)

Expected: `/offline` page renders with "You're offline" heading and a "Browse cached surahs" link.

- [ ] **Step 7: Test install prompt**

On Chrome desktop, look for the install icon in the address bar (or DevTools → Application → Manifest → "Add to homescreen").

Expected: install prompt fires and app installs successfully.

- [ ] **Step 8: Final commit if any fixups were needed**

If any issues were found and fixed in Steps 1–7, commit the fixes:

```bash
git add -p
git commit -m "fix(web): address PWA build/manifest issues found during manual verification"
```

---

## Manual Checklist Summary

Copy this into your PR description when done:

```
- [ ] pnpm build succeeds with Serwist SW output
- [ ] DevTools Manifest: all fields populated, icons load
- [ ] DevTools Service Workers: activated, no errors
- [ ] Offline → cached surah loads from SW cache
- [ ] Offline → uncached surah → /offline page shown
- [ ] Install prompt fires on Chrome desktop
```
