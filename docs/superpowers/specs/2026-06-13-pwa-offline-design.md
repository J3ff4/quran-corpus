# Phase 04 — PWA + Offline Design Spec

**Date:** 2026-06-13
**Status:** Approved
**Scope:** `apps/web` only

---

## 1. Goal

Make the Quran Corpus web app installable as a PWA and functional offline for previously-visited surah pages. No new data dependencies — works with existing DB fixtures in dev, real data when the scraper runs later.

---

## 2. Architecture

### 2.1 Service Worker Library

**`@serwist/next`** (Workbox-based, maintained fork of next-pwa). Wraps `next.config.ts` as a plugin. At build time:
- Compiles `src/sw.ts` → `public/sw.js`
- Injects a precache manifest of all `_next/static/*` chunks
- Registers the SW automatically via injected script

### 2.2 Cache Strategy Layers

| Layer | Strategy | Scope | TTL |
|---|---|---|---|
| Precache | CacheFirst | `_next/static/*`, fonts, icons, `/manifest.webmanifest` | Versioned by build hash |
| Navigation pages | NetworkFirst | `/`, `/surah`, `/surah/[id]?*` | 7 days |
| Offline fallback | SW catch handler | Any navigation miss with no cache entry | — |

**NetworkFirst for pages:** The SW tries the network first (live DB-rendered content). On failure, serves the cached response if available. If no cache entry exists, serves the offline fallback page.

### 2.3 CSP Fix

`next.config.ts` currently lacks `worker-src 'self'`. This blocks SW registration. Add it to the existing CSP header:

```
worker-src 'self'
```

---

## 3. Icon System

### 3.1 Visual Design

Arabic letter **"ق"** (Qaf) in Amiri font, centered on warm paper background. Colors match the app's design system:
- Background: `#faf8f3` (paper-50)
- Letterform: `#1f1a14` (night-300)
- Maskable variant: extra padding (~10% safe zone) so the letterform stays inside Android's circular/squircle crop

### 3.2 Icon Files

| File | Size | Purpose |
|---|---|---|
| `public/icons/icon-192.png` | 192×192 | PWA install (replace placeholder) |
| `public/icons/icon-512.png` | 512×512 | PWA splash / store (replace placeholder) |
| `public/icons/icon-maskable-192.png` | 192×192 | Android maskable |
| `public/icons/apple-touch-icon.png` | 180×180 | iOS home screen |

### 3.3 Generation Pipeline

`scripts/generate-icons.ts` — runs once, outputs committed PNGs. Uses `sharp` for SVG→PNG rasterization. Not a runtime dependency.

```
pnpm tsx scripts/generate-icons.ts
```

---

## 4. Manifest

Replace `public/manifest.json` with `src/app/manifest.ts` (Next.js built-in typed manifest route, auto-served at `/manifest.webmanifest`).

### 4.1 Key Changes from Current `public/manifest.json`

| Field | Before | After |
|---|---|---|
| `start_url` | `/` | `/surah` |
| Icon `purpose` | `"maskable any"` (combined, deprecated) | Two entries: `"any"` + `"maskable"` |
| Screenshots | absent | Two entries (mobile 390×844, wide 1280×800) |

### 4.2 `layout.tsx` Updates

- Add `icons.apple: '/icons/apple-touch-icon.png'` to `metadata`
- Remove `manifest: '/manifest.json'` (Serwist/Next.js handles the webmanifest path)
- `viewport.themeColor` stays as-is (`#1f1a14`)

---

## 5. File Map

```
apps/web/
  package.json                    MODIFY — add @serwist/next, serwist, sharp (devDep)
  next.config.ts                  MODIFY — wrap with withSerwist(); add worker-src 'self' to CSP
  src/sw.ts                       CREATE — SW entry: precache + NetworkFirst routes + offline fallback
  src/app/
    manifest.ts                   CREATE — typed manifest replacing public/manifest.json
    offline/
      page.tsx                    CREATE — offline fallback page
  src/test/
    offline.test.tsx              CREATE — component test for offline page
    manifest.test.ts              CREATE — manifest field snapshot
  public/
    manifest.json                 DELETE — replaced by manifest.ts
    icons/
      icon-192.png                REPLACE — generated from SVG
      icon-512.png                REPLACE — generated from SVG
      icon-maskable-192.png       CREATE — maskable variant
      apple-touch-icon.png        CREATE — 180×180 iOS icon

scripts/
  generate-icons.ts               CREATE — SVG→PNG pipeline via sharp
```

---

## 6. Testing

### 6.1 Automated

- **`offline.test.tsx`** — renders `<OfflinePage />`, asserts offline message text and a link to `/surah`
- **`manifest.test.ts`** — imports the manifest function, checks required fields: `name`, `start_url`, `display`, `icons` array has entries with `purpose: 'any'` and `purpose: 'maskable'` separately

### 6.2 Manual Checklist

Run after implementation before committing:

- [ ] `pnpm build && pnpm start` — app builds without SW errors
- [ ] Chrome DevTools → Application → Manifest: all fields populated, icons load
- [ ] Chrome DevTools → Application → Service Workers: SW registered, status "activated"
- [ ] DevTools → Network → set "Offline" → navigate to a cached surah page → loads from SW cache
- [ ] DevTools → Network → set "Offline" → navigate to uncached surah → offline page shown
- [ ] Chrome address bar shows install prompt (desktop)
- [ ] Lighthouse PWA audit ≥ 90

---

## 7. Dependencies

| Package | Version | Role |
|---|---|---|
| `@serwist/next` | `^9.0.0` | Next.js SW plugin |
| `serwist` | `^9.0.0` | SW runtime (cache strategies) |
| `sharp` | `^0.33.0` | Icon generation (devDep, script only) |

Serwist v9 targets Next.js 14+. Compatible with Next.js 15.

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| CSP blocks SW registration | Add `worker-src 'self'` to CSP — covered in design |
| `manifest.json` → `manifest.webmanifest` path change breaks existing layout.tsx ref | Remove old ref in layout.tsx; Next.js auto-links `manifest.ts` output |
| Serwist precache causes stale Next.js chunks after deploy | Serwist busts cache on new build hash automatically |
| `sharp` not available in CI | Add to devDependencies; icon generation runs locally, PNGs committed to git |
| SSR pages contain DB-rendered content — cached responses may be stale | Acceptable for v1 (Quran text is immutable). 7-day NetworkFirst TTL means fresh content when online. |

---

## 9. Out of Scope (Phase 04)

- Playwright E2E offline tests (deferred to E2E phase per CLAUDE.md §10)
- Audio caching
- Background sync
- Push notifications
- Turso cloud / deployment (separate phase)
- i18n (Uzbek/Russian translations) — no real translation data in DB yet
