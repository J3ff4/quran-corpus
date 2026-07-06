# Phase 09 — PWA Performance Overhaul

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or executing-plans). Steps use `- [ ]` checkboxes.

**Goal:** Tab switches (Home/Read/Dictionary/Search) feel instant; no page ships thousands of rows.

**Architecture:** Kill per-request SSR on the three tab roots — pre-render at build, let Next `<Link>` client-nav + prefetch. Dictionary becomes one static payload filtered/windowed client-side. Big concordances page from an API instead of dumping every verse. Search sheet fixed to actually open.

**Tech Stack:** Next 15 App Router, RSC, libsql (`file:quran.db`), Tailwind, framer-motion, serwist PWA.

## Global Constraints
- Data changes only on re-scrape + redeploy → build-time pre-render is valid.
- No new runtime dep unless a few lines can't do it. Prefer native (`content-visibility`) over a virtualization lib. (PONYTAIL)
- `packages/data` stays web-agnostic — queries there, no Next imports.
- 5-step loop per task; Greptile §5 = 5/5 hard block before merge.
- Build reads committed `apps/web/quran.db`; set `DB_SKIP_MIGRATIONS=true` in build env so DDL never runs in the build path.
- Respect `prefers-reduced-motion`; WCAG AA; 60fps.

---

## File map
- `apps/web/src/app/page.tsx` — Home: drop `force-dynamic` → static.
- `apps/web/src/app/surah/page.tsx` — Read list: drop `force-dynamic` → static.
- `apps/web/src/app/dictionary/page.tsx` — static; read full root list at build, hand to browser component.
- `apps/web/src/components/dictionary/DictionaryBrowser.tsx` — NEW client: search + alpha/freq + letter filter + windowed list. Absorbs DictionaryIndex.
- `apps/web/src/components/dictionary/RootListRow.tsx` — add `content-visibility:auto` windowing class.
- `packages/data/src/queries/roots.ts` — add `getRootConcordancePage(db, bw, {limit, offset})` + `countRootConcordance(db, bw)`.
- `apps/web/src/app/api/roots/[root]/concordance/route.ts` — NEW: paged concordance JSON.
- `apps/web/src/app/dictionary/[root]/page.tsx` — render first page + total; stays dynamic but light.
- `apps/web/src/components/dictionary/ConcordanceList.tsx` — fetch pages from API, append (replaces client slice-reveal).
- `apps/web/src/components/search/SearchSheet.tsx` / `components/shell/BottomNav.tsx` — fix open.
- `apps/web/src/app/search/page.tsx` — remove/redirect (sheet is canonical).
- `apps/web/src/app/**/loading.tsx` — skeletons for detail routes.

---

## Task 1 — Static-ize Home + Read tabs
**Files:** `app/page.tsx`, `app/surah/page.tsx` (remove `export const dynamic='force-dynamic'`). Build env `DB_SKIP_MIGRATIONS=true`.
**Why:** both have no `searchParams` → default to static once the dynamic flag is gone. Static RSC is prefetched by `<Link>` → instant switch.
- [ ] Remove the `force-dynamic` line from both.
- [ ] `DB_SKIP_MIGRATIONS=true pnpm --filter web build`; confirm `/` and `/surah` marked **○ Static** (not ƒ) in build output.
- [ ] Manual: `next start`, tap Home↔Read repeatedly → no server hit (network tab), instant.
**Risk:** build-time DB read path — `file:quran.db` resolves to `apps/web/quran.db` at build cwd (present). If migrations fire at build, flag skips them.
**Rollback:** re-add the two lines.
**Acceptance:** build shows both Static; tab switch has zero network + no visible delay.

## Task 2 — Dictionary: static payload + client filter + windowing
**Files:** `app/dictionary/page.tsx` (static; `getAllRoots` at build → props), NEW `DictionaryBrowser.tsx` (client), `RootListRow.tsx` (+windowing class). Retire `searchParams`-driven server branch + `DictionaryIndex` server toggles.
**Decision:** windowing via native `content-visibility:auto; contain-intrinsic-size: 64px` per row — browser skips offscreen layout/paint, zero dep, all roots stay in DOM (search/letter work without refetch). No react-virtual. (PONYTAIL)
**Client filter:** search box + alpha/freq toggle + letter jump all operate on the in-memory root array; URL `?q/&sort/&letter` synced via `history.replaceState` (no navigation, no server).
- [ ] Failing test `DictionaryBrowser.test.tsx`: renders N rows, typing filters, freq toggle re-sorts, empty query shows all.
- [ ] Build `DictionaryBrowser` (client) consuming `roots: Root[]`; move toggle/search/letter logic client-side.
- [ ] `page.tsx`: drop `force-dynamic` + `searchParams`; read `getAllRoots` + counts at build; render `<DictionaryBrowser roots counts />`.
- [ ] Add `content-visibility` class to `RootListRow`.
- [ ] Tests pass; build shows `/dictionary` **Static**.
- [ ] Manual on dev: scroll 1642 roots smooth; search/sort/letter instant.
**Risk:** first paint ships ~1642×(arabic+bw+count) JSON (~100–150KB) — acceptable one-time, cached by SW. `contain-intrinsic-size` estimate must match real row height or scrollbar jumps → tune to measured px.
**Acceptance:** `/dictionary` Static; browsing/filtering never navigates; smooth scroll on mobile.

## Task 3 — Concordance server-paging + real Load-more
**Files:** `packages/data/src/queries/roots.ts` (+`getRootConcordancePage`, `countRootConcordance`), NEW `app/api/roots/[root]/concordance/route.ts`, `dictionary/[root]/page.tsx`, `ConcordanceList.tsx`.
**Decision:** `[root]` stays dynamic but light — renders first 20 rows + total; client `ConcordanceList` fetches `/api/roots/<bw>/concordance?offset=&limit=20` on Load-more, appends. Replaces slice-reveal (root cause of dead button + full-verse dump on أتي=549).
- [ ] Failing test (packages/scraper or data): `getRootConcordancePage('Aty', limit=20, offset=0)` returns 20; `offset=540` returns 9; `countRootConcordance('Aty')`==549.
- [ ] Add both queries (LIMIT/OFFSET, ORDER stable by surah,ayah,position).
- [ ] API route: validate `root` (buckwalter), clamp `limit≤50`, return `{entries, total}`; input-validate offset/limit (OWASP boundary).
- [ ] `[root]/page.tsx`: fetch page 0 + total; pass to `ConcordanceList`.
- [ ] `ConcordanceList` client: seed with page 0, Load-more fetches next page, disables at total.
- [ ] Tests pass; manual: أتي shows 20, Load-more adds 20 each, stops at 549.
**Risk:** stable ordering required so offset paging doesn't repeat/skip. Buckwalter in URL — encode + validate.
**Acceptance:** big-root page payload small; Load-more works; no full-verse dump.

## Task 4 — Fix Search sheet (+ retire /search)
**Files:** `SearchSheet.tsx`, `BottomNav.tsx`, remove/redirect `app/search/page.tsx`.
- [ ] Reproduce "Search doesn't open" on dev:3939; capture actual cause (state not toggling / AnimatePresence / z-index / `/api/search` error).
- [ ] Failing component test: clicking Search button sets sheet visible; Escape/backdrop closes.
- [ ] Fix root cause.
- [ ] Remove `app/search/page.tsx` (or `redirect('/')`); keep `/api/search` + VersePicker used by the sheet.
- [ ] Tests pass; manual: tap Search → opens <100ms; typing returns results (debounced).
**Risk:** SW disabled in dev — verify in a production build too.
**Acceptance:** sheet opens reliably; one search surface.

## Task 5 — Client-nav polish + measure
**Files:** `app/**/loading.tsx` skeletons for `[root]`, `surah/[id]`, `surah/[id]/words`.
- [ ] Add lightweight skeletons so dynamic detail routes feel instant on nav.
- [ ] Confirm BottomNav `<Link>` prefetch (default) working.
- [ ] Record before/after: build static markers + manual nav timing note in PR body.
**Acceptance:** every tab switch instant; detail routes show skeleton immediately.

---

## Risks (phase)
- Build-time DB read + migrations → `DB_SKIP_MIGRATIONS=true` at build; committed DB already migrated.
- Serwist precache serving stale static after redeploy → confirm SW revalidates/bumps on build (precache manifest hashes change per build).
- `content-visibility` intrinsic-size mismatch → tune to measured row height.
- Offset paging stability → deterministic ORDER BY.

## Rollback
Per-task commits; each independently revertible. Restoring any `force-dynamic` line returns that route to prior behavior.

## Out of scope (→ Phase 10)
Pill centering, clause truncation, occurrence-count backfill, junk-form purge, prev/next root nav.
