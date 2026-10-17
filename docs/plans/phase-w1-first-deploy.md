# Phase W1 — First Production Deploy (web)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** first prod deploy of `apps/web`. Docker on CT 100 (`docker-pve1`, 192.168.0.100), behind the existing Caddy.

**Architecture:**
- Dockerfile in the repo, built from `main`.
- `next start` on :3000.
- `quran.db` is NOT in the image. It is a host directory bind-mounted rw at `/data`.
- Caddy reverse-proxies the hostname to the container.

**Tech:** Node 20 (`.nvmrc`), pnpm 10.34.3 (corepack), Next 15, `@libsql/client` (native, glibc), Docker compose, Caddy, Cloudflare Tunnel.

**State today (verified 2026-10-17):**
- No prod exists.
- Only the dev server on CT 103 (:3941) has ever run.
- The repo has no Dockerfile, compose, or Caddy config.
- The step-8 handoff in `phase-m13-russian-wbw.md` assumed a prod that never existed. This plan replaces it.

## Global Constraints

- Build from `main` unless the owner says otherwise. PR #119 (M13-B) is a draft.
- No new deps. Docker and Caddy are infra, not package deps.
- The DB never goes in git or in the image (§9).
- No secrets. App env is only `DATABASE_URL`, `DB_SKIP_MIGRATIONS`, `NODE_ENV`; none are secret.
- The owner approves every push, PR, merge and deploy step. CT 100 actions run only by the homelab session, with owner go per step.

## Facts the plan rests on (checked on `main` 8227ffea)

| Fact | Where | Consequence |
|---|---|---|
| Every DB page/route is `force-dynamic`; only `/offline` is static and DB-free | `apps/web/src/app/**` | `next build` needs no DB. DB is runtime-only. |
| `DATABASE_URL` default `file:quran.db` (cwd-relative) | `apps/web/src/lib/db.ts:21` | Set `file:/data/quran.db` explicitly. |
| `normalizeArabicJoinKeys` writes even under `DB_SKIP_MIGRATIONS=true` | `db.ts` (self-heal block) | Mount must be **rw**. Mount the **directory**, not the file: WAL needs `-wal`/`-shm` siblings. |
| `@libsql/client` is native, externalized | `next.config.ts:9-20` | Use glibc base (`node:20-bookworm-slim`), not alpine. No `output: 'standalone'`: native external plus pnpm symlinks make tracing fiddly. |
| web imports `packages/data/dist`, which needs a build | `packages/data/package.json` exports | Build `@quran-corpus/web...` (deps first), not web alone. |
| App sets HSTS `includeSubDomains` + strict nonce CSP | `next.config.ts`, `middleware.ts` | Serve only over HTTPS hostname. CSP has no external origins except `media-src https:` (audio). |
| Workspace includes `apps/mobile` (285M assets), `packages/scraper` (423M, Python) | — | `.dockerignore` must drop them except the `package.json` files that frozen-lockfile needs. |

## Decisions (owner)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Public hostname | Owner names it. Tunnel + Caddy route need it. |
| D2 | How Caddy reaches the container | Same Docker network as Caddy if Caddy is a container on CT 100, so no host port. Else publish `127.0.0.1:3941:3000` (3941 = familiar dev port, free on CT 100). Homelab session reports which. |
| D3 | `DB_SKIP_MIGRATIONS` | `true`. The DB arrives pre-migrated; keeps DDL out of the request path. |
| D4 | Which DB file | `quran.db.deploy-m13b` (sha256 `1483e279…fc86d`, verified). It is a superset of main's schema, so main ignores `word_gloss_fts`. Deploying PR B later is then rebuild-only, with no DB swap. |
| D5 | Compose file home | Homelab-only: it has host paths and network names. The repo gets Dockerfile + `.dockerignore` only. |

## Task 1 — Dockerfile + .dockerignore (CT 103, this repo)

**Files:**
- Create: `apps/web/Dockerfile`
- Create: `.dockerignore` (repo root; build context = root)

- [ ] **Step 1: `.dockerignore`**
```
**/node_modules
**/.next
**/dist
**/*.db
**/*.db-*
.git
**/.env*
temp
docs
apps/mobile/*
!apps/mobile/package.json
packages/scraper
packages/mobile-data/*
!packages/mobile-data/package.json
```
  `packages/scraper` is Python, not a workspace project, so it is dropped whole. If `pnpm install --frozen-lockfile` then complains a workspace project is missing, re-include that `package.json`. Never drop `--frozen-lockfile`.

- [ ] **Step 2: `apps/web/Dockerfile`**
```dockerfile
# ponytail: single stage, full workspace node_modules (~1GB image).
# Slim it with output:'standalone' only if image size starts to matter.
FROM node:20-bookworm-slim
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@quran-corpus/web..." \
 && pnpm --filter "@quran-corpus/web..." run build
ENV NODE_ENV=production \
    DATABASE_URL=file:/data/quran.db \
    DB_SKIP_MIGRATIONS=true
USER node
WORKDIR /repo/apps/web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:3000/surah/1').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["pnpm", "exec", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
```
  The healthcheck hits `/surah/1`, which reads the DB, so a missing or unreadable mount turns the container unhealthy.

- [ ] **Step 3: verify without Docker** (CT 103 has none). Simulate the image's steps on a clean checkout:
  - Run `git worktree add $CLAUDE_JOB_DIR/tmp/w1 HEAD`.
  - Install and build with the same two `pnpm` commands.
  - Run `DATABASE_URL=file:/home/claude/quran-data/quran.db.deploy-m13b DB_SKIP_MIGRATIONS=true NODE_ENV=production pnpm exec next start -p 3942`.
  - Expect `/surah/1`, `/search?q=mercy` and `/dictionary` → 200. The response CSP header has a nonce.
  - Kill the server and remove the worktree.
  - **Never** run `next build` in `apps/web` of the main checkout while `next dev` runs there. That breaks the dev server's shared `.next` (see memory).
- [ ] **Step 4: self-review.** Check that `.dockerignore` drops `*.db`, so the DB never goes in the image. Check that `**/.env*` is excluded.
- [ ] **Step 5: commit** `build(web): Dockerfile for production deploy`. Push and open the PR only on owner go. §5 does not trigger (build files).

## Task 2 — Merge (owner)

- [ ] The owner merges the Task 1 PR to `main`. CT 100 builds from `main` (Global Constraints).

## Task 3 — Host prep (CT 100, homelab session)

- [ ] **Step 1: report before changing anything.**
  - Caddy: container or host; its compose file and network name; where its Caddyfile lives.
  - How the Cloudflare Tunnel routes (to Caddy, or per-hostname).
  - Free disk (DB 177MB + image ~1GB).
  - Answers D2.
- [ ] **Step 2: DB directory.**
  - `mkdir -p /opt/quran-corpus/data`, then `chown 1000:1000` (image user `node` = uid 1000).
  - Pull the DB:
    - `scp claude@192.168.0.103:/home/claude/quran-data/quran.db.deploy-m13b /opt/quran-corpus/data/quran.db`
    - The checksum must equal `1483e2796ce9e44d40ff7ad37c4b11b48e44ef315c165538c87085f4172fc86d`.
    - If there is no SSH key, the owner copies it. Do not edit SSH config.
  - Verify:
    - `sqlite3 quran.db "SELECT count(*) FROM word_gloss_fts_docsize; PRAGMA quick_check;"` → `309706`, `ok`.
    - If `sqlite3` is absent, skip this check; the healthcheck covers readability.
- [ ] **Step 3: source.** `git clone https://github.com/J3ff4/quran-corpus /opt/quran-corpus/src`, at `main`.

## Task 4 — Compose service + first run (CT 100)

- [ ] **Step 1:** `/opt/quran-corpus/compose.yaml`:
```yaml
services:
  quran-web:
    build:
      context: ./src
      dockerfile: apps/web/Dockerfile
    image: quran-corpus-web:${GIT_SHA:-local}
    container_name: quran-web
    restart: unless-stopped
    volumes:
      - /opt/quran-corpus/data:/data
    # D2 path A (Caddy is a container): join its network, no ports.
    networks: [caddy]
    # D2 path B (Caddy on host): drop `networks`, use
    # ports: ["127.0.0.1:3941:3000"]
networks:
  caddy:
    external: true
    name: <name reported in Task 3 Step 1>
```
- [ ] **Step 2: build and run.**
  - `cd /opt/quran-corpus && GIT_SHA=$(git -C src rev-parse --short HEAD) docker compose up -d --build`
  - Wait for `docker inspect -f '{{.State.Health.Status}}' quran-web` to show `healthy`.
  - `docker logs quran-web` must contain no `skipped` warnings.
- [ ] **Step 3: internal smoke.** From the Caddy container or host, request `http://quran-web:3000/surah/1` or `127.0.0.1:3941` → 200.

## Task 5 — Caddy + tunnel (CT 100, owner go)

- [ ] **Step 1:** Caddyfile site:
```
<D1 hostname> {
	reverse_proxy quran-web:3000   # path B: 127.0.0.1:3941
}
```
  Then `caddy validate`, then reload (not restart).
  - If the tunnel terminates TLS at Cloudflare and hits Caddy over http, match the existing sites' pattern (e.g. `http://<host>`). Copy that pattern; don't invent one.
- [ ] **Step 2:** tunnel route for D1 → Caddy, matching how the existing hostnames route.

## Task 6 — Prod verification (owner + homelab session)

Log results in the table below.

| # | Check | Expect |
|---|---|---|
| P1 | `https://<D1>/` | Home renders. DevTools console has no CSP errors. |
| P2 | `/surah/2/words?lang=ru` | Russian WBW glosses (M13-A is on main). |
| P3 | `/search?q=mercy` | Verses + Roots. No Words section, because main lacks M13-B. That is correct. |
| P4 | Response headers | CSP with nonce, HSTS, nosniff, `X-Frame-Options: DENY`. |
| P5 | Reload offline after a first visit | `/offline` page served by the service worker. |
| P6 | `docker restart quran-web` | Back to healthy; P1 still passes. |

## Update runbooks (after W1)

- **New build:**
  - `git -C src pull`, then `GIT_SHA=… docker compose up -d --build`.
  - Keep the previous `quran-corpus-web:<sha>` image for rollback.
- **PR B, once merged:** rebuild only (D4). Then search `милост` → Words section with top row رَحْمَة "милость" 67.
- **New DB:**
  - scp to `quran.db.new` and verify the checksum.
  - `docker compose stop`.
  - Back up to `quran.db.bak-<date>`.
  - `rm -f quran.db-wal quran.db-shm`, then `mv quran.db.new quran.db`.
  - `docker compose start`.

## Risks / rollback

| Risk | Mitigation / rollback |
|---|---|
| libsql native binary missing for the image arch | bookworm (glibc) x64 prebuilt. Task 1 Step 3 proves the install path. If the image fails, the container logs show it at first request. |
| `--frozen-lockfile` fails because `.dockerignore` hid a workspace `package.json` | Re-include that `package.json` (Task 1 Step 1 note). |
| Mount read-only or wrong uid → writes fail | `normalizeArabicJoinKeys` failure is non-fatal (warn). WAL needs a writable dir: chown 1000 (Task 3 Step 2). |
| HSTS `includeSubDomains` on the wrong host | Serve only on the D1 hostname over HTTPS. Never expose plain http publicly. |
| Bad deploy | `docker compose down`. Caddy returns 502, nothing else is affected. Remove the Caddy site to take it fully offline. |
| DB swapped while the container runs | Runbook always stops first. Never `mv` over a live WAL DB. |

## Acceptance

- Task 1 Step 3 passes locally.
- Container `healthy` on CT 100.
- P1–P6 PASS, logged below.
- Hostname reachable over HTTPS.

## Verification log

| # | Result |
|---|---|
| P1 | |
| P2 | |
| P3 | |
| P4 | |
| P5 | |
| P6 | |
