# Versioned API v1 — Design Spec

**Date:** 2026-07-29
**Status:** approved in brainstorming, then **narrowed at planning time** — see below
**Supersedes:** the three ad-hoc unversioned routes under `apps/web/src/app/api/`

> **§4's twelve-route surface is NOT being built.** `docs/plans/phase-19-versioned-api-v1.md`
> implements **three** routes — `/surahs`, `/search`, `/roots/{bw}/concordance` — the
> only ones with a caller.
>
> **Why: D2 and D3 contradict each other.** D3 asks for a full read API; D2 says
> `apps/mobile` bundles the corpus DB and works fully offline. An offline consumer
> does not call a read API, so nine of the twelve routes would have shipped with no
> consumer at all — while adding nine unauthenticated, un-rate-limited endpoints to
> a homelab box whose mitigation (D6) is still unconfigured.
>
> Everything else here still holds and is still built: D6, D7, D9, D10, D11, the
> architecture in §3, the validation rules in §6, and the migration in §9. The nine
> dropped routes are additive under D7 — adding any of them later needs no version
> bump and no v2. §4 is kept as the design record for when something calls them.
>
> Two response-shape claims below are also wrong, corrected in the plan: `/search`
> cannot take `limit`/`offset` (its query returns an internally-capped composite),
> and the concordance body *does* change (`entries` → `items`) — §9's "none" column
> referred to params only.

---

## 1. Goal

Expose the corpus — text, morphology, grammar, dictionary, translations, audio —
as a versioned read-only HTTP API at `/api/v1`, backed by `packages/data`.
Primary consumer: `apps/mobile` (not yet built). Delivers PRD §1's "typed backend
API that corpus.quran.com never had".

**Non-goals (v1):** writes, user accounts, auth, public developer programme,
DB-update/sync endpoints, OpenAPI document.

---

## 2. Decisions (all settled in brainstorming, 2026-07-29)

| # | Decision | Rationale |
|---|---|---|
| D1 | Consumer = `apps/mobile` only, private | No API keys, no public docs, no deprecation policy |
| D2 | Mobile still bundles the corpus DB | PRD §6.4 "complete offline" holds; API never on the reading critical path |
| D3 | Full read API + per-ayah audio | User's explicit scope |
| D4 | Lives in `apps/web` route handlers under `/api/v1` | Reuses the deployed container, Caddy, Cloudflare Tunnel. Zero new infra |
| D5 | Existing 3 routes move to v1; web callers migrated; **no redirect shims** | One surface, no legacy |
| D6 | Cloudflare edge rate limiting; **no app auth** | Data is public-domain scholarship; the threat is homelab resource abuse, not leakage |
| D7 | Additive-only within v1; breaking change forces v2 | See §7 |
| D8 | Mobile = React Native / Expo (TypeScript) | Types shareable as code |
| D9 | Bare JSON responses, HTTP status carries outcome | Matches existing routes; nothing to unwrap |
| D10 | New `packages/api-contract`, zod schemas as the single artifact | Types via `z.infer`; validation and types cannot drift |
| D11 | limit/offset pagination with per-endpoint caps | Data layer already supports it |
| D12 | No DB-update/sync endpoint in v1 | Deferred until `apps/mobile` exists and its bundle strategy is known. Additive later |

**Dependency approved:** `zod`, added to `packages/api-contract` (CLAUDE.md §12).
It is the only new runtime dependency.

### Deviation from PRD, recorded deliberately

PRD §1 line 84 lists "(later) developers consuming the API" as a user group.
D1 narrows v1 to a private consumer. Nothing in this design forecloses opening
it later — it defers keys, quotas, published docs, and a stability policy.
Reopening that decision means revisiting D6 and §7, not rewriting the surface.

---

## 3. Architecture

```
packages/api-contract/              NEW
  src/v1/common.ts                  pagination, error body, AyahRef, shared params
  src/v1/{surahs,ayahs,words,roots,search,translations,audio}.ts
  src/v1/index.ts                   namespace barrel
  src/index.ts                      re-exports `v1`

apps/web/src/app/api/v1/
  _lib/respond.ts                   parse → validate → query → map → Response
  _lib/map.ts                       packages/data row types → v1 DTOs
  <route dirs>/route.ts             one thin handler each
```

**Dependency direction is one-way:** `packages/data` (rows) → `_lib/map.ts`
(DTOs) → `packages/api-contract` (shape).

`packages/api-contract` imports **nothing** from `packages/data`. Mobile gets
types without dragging `@libsql/client` into its bundle — the same failure the
`@quran-corpus/data/client` split already exists to prevent (see the
client-barrel poison incident, fixed in `9f4cb96`).

Handlers are adapters only: parse, validate, call one query, map, respond. No
SQL and no business logic in `apps/web` (CLAUDE.md §2/§3). This also keeps a
later lift into `apps/api` a move rather than a rewrite.

---

## 4. Endpoint surface — 12 routes

All under `/api/v1`. All `GET`. All read-only.

| Route | Backing query |
|---|---|
| `/surahs` | `getAllSurahs` |
| `/surahs/{id}` | `getSurahById` |
| `/surahs/{id}/ayahs?from=&to=` | `getAyahsBySurah`, `getWordsBySurahAyahRange` |
| `/ayahs/{s}:{a}` | `getAyahWithWords` |
| `/ayahs/{s}:{a}/translations?lang=` | `getTranslationsByAyah` |
| `/words/{s}:{a}:{w}` | `getWordDetail`, `getSegmentsByWordIds`, `getGlossesWithFallback` |
| `/roots?sort=&limit=&offset=` | `getAllRoots`, `getRootsByFrequency` |
| `/roots/{bw}` | `getRootEntry`, `getRootForms`, `getRootDefinitions` |
| `/roots/{bw}/concordance?forms=&limit=&offset=` | `getRootConcordancePage` + `countRootConcordance` |
| `/search?q=&limit=&offset=` | `search` |
| `/translations?lang=` | `getTranslationsBySurahAndLang` |
| `/audio/{s}:{a}?reciter=` | none — new reciter registry |

Notes:

- **Word glosses** come from `getGlossesWithFallback`, which already implements
  language fallback. `/words/{s}:{a}:{w}` exposes it; `lang` is an optional
  param defaulting to the same fallback chain the web uses.
- **`/audio` is the only route with no query behind it.** It resolves
  `(surah, ayah, reciter)` → URL. `ayahs.audio_url` wins when populated
  (**empty on all 6236 rows as of 2026-07-29**); the registry is the fallback.
  This is the web hook's existing precedence (`useAyahAudio.buildAudioUrl`)
  lifted server-side, and it is where the hardcoded
  `Abdul_Basit_Murattal_64kbps` string moves to. Unknown `reciter` → 400.
- **Pagination costs no query work.** `getRootConcordancePage` and
  `countRootConcordance` already exist and back the live web concordance.
- `getLemmaFrequency` and `getVerbConcordance` are **not** exposed in v1 — no
  consumer. Adding them later is additive (D7).

---

## 5. Response shape

Bare JSON. Collections return an array; single resources return an object.
Paginated collections return `{ items, total, limit, offset }` — the one place
an envelope earns itself, because `total` has nowhere else to live.

Error body, every non-2xx:

```json
{ "error": "invalid_params", "message": "surah must be between 1 and 114" }
```

`error` is a stable machine code; `message` is human text and is **not** part of
the compatibility contract (D7 covers `error` codes, not prose).

Codes: `invalid_params` (400), `not_found` (404), `internal` (500).
No 401/403 — unauthenticated is the design (D6), not an oversight.

---

## 6. Validation, security, caching

**Every parameter validated at the boundary via its zod schema** (CLAUDE.md §3,
OWASP). Bounds:

| Param | Rule |
|---|---|
| `surah` | integer 1–114 |
| `ayah` | integer, bounded by that surah's `ayah_count` (404 past the end) |
| `word` | integer ≥ 1, bounded by the ayah's word count |
| `{bw}` root | existing Buckwalter regex — see below the table |
| `q` | 1–100 chars (matches what `/api/search` enforces today) |
| `limit` | default 20; per-endpoint max; **global ceiling 100** |
| `offset` | integer ≥ 0, capped — an uncapped offset makes SQLite scan |
| `forms` | comma-separated ids, **max 50**, oversized → 400 |
| `lang` | must match a `language_code` present in the DB; omitted → the `getGlossesWithFallback` chain, unchanged from what the web uses today |

The Buckwalter pattern, verbatim from
`apps/web/src/app/api/roots/[root]/concordance/route.ts` (kept out of the table
above because it contains a `|`):

```
/^[A-Za-z'`><{}|&*$~]{1,12}$/
```

**Preserve, do not flatten, the concordance route's existing validation.** It
already enforces `MAX_LIMIT = 50` (not 100 — concordance rows carry verse text),
`MAX_FORM_IDS = 50`, and throws `FormIdLimitError` → 400 rather than silently
truncating an oversized `forms` list. A caller asking for N ids must never get a
200 scoped to fewer than N with no signal. Port this behaviour verbatim; the
global ceiling is a ceiling, not a replacement for a tighter per-endpoint cap.

**Other rules:**
- Errors never echo raw input back.
- DB errors and stack traces never reach the client — code plus a server log.
- **No CORS headers, deliberately.** A native client doesn't need them and web
  is same-origin. `Access-Control-Allow-Origin: *` would hand any webpage the
  homelab's read bandwidth.
- Rate limiting is enforced at the Cloudflare edge, not in the handlers, so
  abuse costs the origin nothing.

**Caching.** Corpus data is immutable between scrapes:
`Cache-Control: public, max-age=86400` on reading, morphology, dictionary, and
audio routes. `/search` gets a short TTL — its query space is unbounded, so a
long edge TTL is a cache-fill vector rather than a win.

---

## 7. Versioning contract

Version in the path (`/api/v1`), mirrored by `packages/api-contract/src/v1/`.
v2 becomes a sibling directory so both can be imported during a transition.

**Additive-only within v1.** Permitted without a version bump: new endpoints,
new fields on existing responses, new optional params. **Requires v2:** removing
or renaming a field, changing a field's type, changing an `error` code's
meaning, changing an existing param's semantics.

Two things make this real rather than aspirational:

1. **Zod strips unknown keys by default.** A client on an older contract parsing
   a newer response drops fields it doesn't know instead of throwing. Forward
   compatibility falls out of D10 — no `.passthrough()` required.
2. **Contract tests assert it** (§8). "The handler returns what v1 promises" is
   checked, not hoped.

**No deprecation policy, on purpose.** D1 means one consumer, controlled by the
same person. v1 retires when the last binary using it is gone. A written sunset
window here would be theatre.

---

## 8. Testing

New logic ships with tests (CLAUDE.md §10).

- **Contract tests** — every handler's response parsed against its own zod
  schema. This is the payoff for D10 and the mechanism behind §7's guarantee.
- **Mapper unit tests** — row → DTO in isolation, in `_lib/map.ts`.
- **Validation tests** — each bound in §6 enforced; bad input → 400 with the
  correct `error` code; oversized `forms` → 400, never a truncated 200.
- **Audio registry tests** — `audio_url` precedence over registry fallback;
  unknown reciter → 400.
- **Regression:** `packages/data` is untouched, so its 176 tests must stay
  green unchanged. `apps/web`'s 403 must pass after the §9 caller migration.

---

## 9. Migration of the three existing routes

Clean cut, no shims (D5). Old paths deleted in the same change.

| Old | New | Shape change |
|---|---|---|
| `/api/search` | `/api/v1/search` | none |
| `/api/surahs` | `/api/v1/surahs` | returns `SurahDTO`, **not** `PickerSurah` |
| `/api/roots/[root]/concordance` | `/api/v1/roots/{bw}/concordance` | none (params preserved) |

**Call sites — two production files plus their tests:**

- `apps/web/src/components/search/SearchSheet.tsx:23` → `/api/surahs`
- `apps/web/src/components/search/SearchSheet.tsx:46` → `/api/search`
- `apps/web/src/components/dictionary/ConcordanceList.tsx:109` → concordance
- Tests: `src/test/SearchSheet.test.tsx`, `src/test/ConcordanceList.test.tsx`

`PickerSurah` stops being a wire type. `/api/v1/surahs` returns a neutral
`SurahDTO`; `SearchSheet` maps it with the existing `toPickerSurah` on its own
side. That removes the leaked abstraction — a web component's type frozen into a
URL — which is the concrete thing versioning is meant to fix here.

---

## 10. Risks

| Risk | Mitigation |
|---|---|
| A web deploy restarts the API (shared process, D4) | Accepted: mobile bundles the DB (D2), so the API is never on the reading path. Revisit only if that changes |
| Unauthenticated public endpoint abused | Cloudflare edge rate limiting (D6) + hard caps (§6). Structured request logging so abuse is visible before it hurts |
| DTO/row drift as the schema evolves | `_lib/map.ts` is the single choke point; mapper tests fail loudly on a rename |
| `zod` in the mobile bundle | Contract package exports schemas and inferred types together; if bundle size ever matters, split a types-only entry point as `packages/data` did with `./client` |
| v1 quietly becomes decoration | §7's rules are testable and §8 tests them |

## 11. Rollback

Additive until §9 runs. Reverting the migration commit restores the three old
routes and their callers together — they change in one commit for exactly this
reason. `packages/api-contract` and `/api/v1` can be left in place, unused, or
dropped separately; nothing else depends on them.
