# Phase 08b App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real Home page at `/` + persistent bottom tab bar (Home · Read · Dictionary · Search), replacing the `/`→`/surah` redirect and the floating search FAB.

**Architecture:** One new client component `BottomNav` (pathname-driven active state + owns the `SearchSheet` overlay). One new server Home page. Wire both into `layout.tsx`; delete the FAB; point PWA `start_url` at `/`. No `packages/data` change → no rebuild.

**Tech Stack:** Next.js 15 App Router, React 19, TS, Tailwind (paper-*/night-* tokens), vitest + @testing-library/react (jsdom). Spec: `docs/superpowers/specs/2026-07-04-phase-08b-app-shell-design.md`.

## Global Constraints

- No new npm dependency (icons = hand-written inline SVG). §12 CLAUDE.md.
- No `packages/data` edit; no schema/query/migration change; no rebuild.
- Tailwind colour tokens only: `paper-*` / `night-*`. No raw hex.
- Accessibility WCAG AA: active tab carries `aria-current="page"`; icons `aria-hidden`; nav has `aria-label`.
- Conventional Commits, scope `web`. One logical change per commit.
- Greptile ≥ 4/5 on the branch before merge (§5, hard block).
- `Surah` shape (from `@quran-corpus/data`): `{ id:number; name_arabic:string; name_translit:string; name_translation:string; revelation_type:'meccan'|'medinan'; ayah_count:number; order_number:number }`.
- `getAllSurahs(db: Client): Promise<Surah[]>`. `getDatabase(): Promise<Client>` from `apps/web/src/lib/db.ts`.
- `SearchSheet` props: `{ open: boolean; onClose: () => void }`; renders `role="dialog"` `aria-label="Search"` only while `open`.

---

### Task 1: BottomNav component

**Files:**
- Create: `apps/web/src/components/shell/BottomNav.tsx`
- Test: `apps/web/src/test/BottomNav.test.tsx`

**Interfaces:**
- Consumes: `SearchSheet` from `../search/SearchSheet` (`{ open, onClose }`); `usePathname` from `next/navigation`.
- Produces: `export function BottomNav(): JSX.Element` — no props. Mounted once, app-wide, in `layout.tsx` (Task 3).

- [ ] **Step 1: Write the failing test**

`apps/web/src/test/BottomNav.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BottomNav } from '../components/shell/BottomNav';

const mockPath = vi.fn(() => '/');
vi.mock('next/navigation', () => ({ usePathname: () => mockPath() }));

describe('BottomNav', () => {
  it('renders Home, Read, Dictionary links + a Search button', () => {
    mockPath.mockReturnValue('/');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /read/i })).toHaveAttribute('href', '/surah');
    expect(screen.getByRole('link', { name: /dictionary/i })).toHaveAttribute('href', '/dictionary');
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument();
  });

  it('marks Read active on a surah route, Home not active', () => {
    mockPath.mockReturnValue('/surah/2');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: /read/i })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /home/i })).not.toHaveAttribute('aria-current');
  });

  it('marks Read active on a word route (word ⊂ reading)', () => {
    mockPath.mockReturnValue('/word/2/255/1');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: /read/i })).toHaveAttribute('aria-current', 'page');
  });

  it('marks Dictionary active on a root route', () => {
    mockPath.mockReturnValue('/dictionary/ktb');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: /dictionary/i })).toHaveAttribute('aria-current', 'page');
  });

  it('opens the search sheet when Search is tapped', () => {
    mockPath.mockReturnValue('/');
    render(<BottomNav />);
    expect(screen.queryByRole('dialog', { name: /search/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    expect(screen.getByRole('dialog', { name: /search/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @quran-corpus/web test -- BottomNav`
Expected: FAIL — cannot resolve `../components/shell/BottomNav`.

- [ ] **Step 3: Write the component**

`apps/web/src/components/shell/BottomNav.tsx`:

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SearchSheet } from '../search/SearchSheet';

interface LinkItem {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  icon: ReactNode;
}

const ICON = 'h-6 w-6';

const HomeIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
);

const BookIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2z" />
    <path d="M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2z" />
  </svg>
);

const DictIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 6c-1.5-1.2-3.5-2-6-2H3v14h3c2.5 0 4.5.8 6 2" />
    <path d="M12 6c1.5-1.2 3.5-2 6-2h3v14h-3c-2.5 0-4.5.8-6 2" />
    <path d="M12 6v14" />
  </svg>
);

const SearchIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const LINK_ITEMS: LinkItem[] = [
  { href: '/', label: 'Home', match: (p) => p === '/', icon: HomeIcon },
  {
    href: '/surah',
    label: 'Read',
    match: (p) => p.startsWith('/surah') || p.startsWith('/word'),
    icon: BookIcon,
  },
  { href: '/dictionary', label: 'Dictionary', match: (p) => p.startsWith('/dictionary'), icon: DictIcon },
];

const itemClass = 'flex h-16 flex-col items-center justify-center gap-1 text-xs';
const activeColor = 'text-paper-900 dark:text-paper-100';
const idleColor = 'text-paper-500 dark:text-paper-400';

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-paper-200 bg-paper-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-night-100 dark:bg-night-300/95"
      >
        {LINK_ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`${itemClass} ${active ? activeColor : idleColor}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-label="Search"
          onClick={() => setSearchOpen(true)}
          className={`${itemClass} ${searchOpen ? activeColor : idleColor}`}
        >
          {SearchIcon}
          <span>Search</span>
        </button>
      </nav>
      <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @quran-corpus/web test -- BottomNav`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/shell/BottomNav.tsx apps/web/src/test/BottomNav.test.tsx
git commit -m "feat(web): add BottomNav shell component"
```

---

### Task 2: Home page

**Files:**
- Modify (full rewrite): `apps/web/src/app/page.tsx`

**Interfaces:**
- Consumes: `getDatabase` (`apps/web/src/lib/db`), `getAllSurahs` (`@quran-corpus/data`), `SurahCard` (`../components/surah-list/SurahCard`).
- Produces: default-export async server component at route `/`. No exported values other tasks depend on.

Note: server-component-with-DB isn't unit-testable in jsdom (matches `/surah`, which ships untested). Verify by type-check + build + the empty-DB guard. Do NOT add a vitest file for this page.

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `apps/web/src/app/page.tsx` (currently `redirect('/surah')`) with:

```tsx
import Link from 'next/link';
import { getDatabase } from '../lib/db';
import { getAllSurahs } from '@quran-corpus/data';
import { SurahCard } from '../components/surah-list/SurahCard';

// DB-dependent page — opt out of static pre-rendering (matches /surah).
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Quran Corpus' };

const FEATURED_SURAH_IDS = [1, 2, 36, 67];

const TILES = [
  { href: '/dictionary', label: 'Dictionary', subtitle: 'Roots & meanings' },
  { href: '/dictionary/lemma-frequency', label: 'Lemma frequency', subtitle: 'Most common words' },
  { href: '/dictionary/verb-concordance', label: 'Verb concordance', subtitle: 'Verb forms in context' },
  { href: '/about', label: 'About & Credits', subtitle: 'Sources & licenses' },
];

export default async function HomePage() {
  const db = await getDatabase();
  const surahs = await getAllSurahs(db);
  const featured = FEATURED_SURAH_IDS.map((id) => surahs.find((s) => s.id === id)).filter(
    (s): s is NonNullable<typeof s> => s != null,
  );

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <section className="mb-10 text-center">
        <p dir="rtl" className="font-arabic text-3xl text-paper-900 dark:text-paper-100">
          بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-paper-900 dark:text-paper-100">Quran Corpus</h1>
        <p className="mt-1 text-sm text-paper-500 dark:text-paper-400">
          Word-by-word morphology, grammar, and translations
        </p>
        <Link
          href="/search"
          className="mt-6 flex items-center gap-2 rounded-full border border-paper-200 bg-paper-100 px-4 py-3 text-left text-paper-500 transition-colors hover:bg-paper-200 dark:border-night-100 dark:bg-night-200 dark:text-paper-400 dark:hover:bg-night-100"
        >
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <span>Search the Quran…</span>
        </Link>
      </section>

      {featured.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-paper-500 dark:text-paper-400">
            Read
          </h2>
          <ul className="space-y-2">
            {featured.map((surah) => (
              <li key={surah.id}>
                <SurahCard surah={surah} />
              </li>
            ))}
          </ul>
          <Link
            href="/surah"
            className="mt-3 inline-block text-sm text-paper-600 hover:text-paper-900 dark:text-paper-400 dark:hover:text-paper-100"
          >
            All 114 surahs →
          </Link>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-paper-500 dark:text-paper-400">
          Explore
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {TILES.map((tile) => (
            <Link
              key={tile.href}
              href={tile.href}
              className="rounded-xl bg-paper-100 px-4 py-4 transition-colors hover:bg-paper-200 dark:bg-night-200 dark:hover:bg-night-100"
            >
              <p className="text-sm font-medium text-paper-900 dark:text-paper-100">{tile.label}</p>
              <p className="mt-0.5 text-xs text-paper-500 dark:text-paper-400">{tile.subtitle}</p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Type-check + lint**

Run: `pnpm --filter @quran-corpus/web type-check && pnpm --filter @quran-corpus/web lint`
Expected: both pass, no errors.

- [ ] **Step 3: Verify build renders the route**

Run: `pnpm --filter @quran-corpus/web build`
Expected: build succeeds; `/` listed in the route output (no longer a redirect). Empty-DB safe: hero + tiles render without data, preview hidden when `featured` is empty.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx
git commit -m "feat(web): replace / redirect with real Home page"
```

---

### Task 3: Mount nav, drop FAB, retarget PWA

**Files:**
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/app/manifest.ts:8`
- Delete: `apps/web/src/components/search/SearchTrigger.tsx`
- Delete: `apps/web/src/test/SearchTrigger.test.tsx`

**Interfaces:**
- Consumes: `BottomNav` (Task 1) from `../components/shell/BottomNav`.
- Produces: nothing new; integration only.

- [ ] **Step 1: Swap the FAB for the nav in layout**

In `apps/web/src/app/layout.tsx`:

Change the import line 4 from:
```tsx
import { SearchTrigger } from '../components/search/SearchTrigger';
```
to:
```tsx
import { BottomNav } from '../components/shell/BottomNav';
```

Change the `<body>` open tag (line 42) to add bottom clearance for the fixed nav:
```tsx
      <body className="bg-paper-50 pb-[calc(4rem+env(safe-area-inset-bottom))] font-sans text-paper-900 antialiased dark:bg-night-300 dark:text-paper-100">
```

Change the body children (line 43-44) from:
```tsx
        {children}
        <SearchTrigger />
```
to:
```tsx
        {children}
        <BottomNav />
```

- [ ] **Step 2: Retarget the PWA start_url**

In `apps/web/src/app/manifest.ts` line 8, change:
```tsx
    start_url: '/surah',
```
to:
```tsx
    start_url: '/',
```

- [ ] **Step 3: Delete the FAB component + its test**

```bash
git rm apps/web/src/components/search/SearchTrigger.tsx apps/web/src/test/SearchTrigger.test.tsx
```

- [ ] **Step 4: Full web suite + lint + type-check green**

Run: `pnpm --filter @quran-corpus/web test && pnpm --filter @quran-corpus/web lint && pnpm --filter @quran-corpus/web type-check`
Expected: all pass. No remaining reference to `SearchTrigger` (grep to confirm):
Run: `grep -rn "SearchTrigger" apps/web/src` → no output.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/layout.tsx apps/web/src/app/manifest.ts
git commit -m "feat(web): mount BottomNav app-wide, drop search FAB, land PWA on Home"
```

---

## Acceptance (whole branch)

- `/` renders Home (hero + search bar + browse preview + tiles), not a redirect.
- Bottom nav visible on every page, fixed, content cleared, 4 tabs.
- Current-route tab highlighted + `aria-current="page"`; `/word/...` → Read active.
- Home/Read/Dictionary navigate; Search opens the `SearchSheet` overlay.
- Old 🔍 FAB gone; no `SearchTrigger` references remain.
- `manifest.ts start_url === '/'`.
- Web lint + type-check + full test suite green. Greptile ≥ 4/5.

## Rollback

Display/routing only — no schema/data/query change. Revert the branch: restores `page.tsx` redirect, `SearchTrigger` in layout, `start_url:'/surah'`.
