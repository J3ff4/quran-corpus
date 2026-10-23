# Build context is the repo root: docker build -f apps/web/Dockerfile .
# ponytail: single stage with the full workspace node_modules (~1GB image);
# move to output:'standalone' only if image size starts to matter.
# Node 24 LTS, not .nvmrc's 20: 20 reached end-of-life 2026-04-30, and 24 is
# what the dev box runs and what the pre-merge check of this file ran on.
# bookworm (glibc), not alpine: @libsql/client loads a native binary.
FROM node:24-bookworm-slim
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@quran-corpus/web..." \
 && pnpm --filter "@quran-corpus/web..." run build
# quran.db is never baked in: mount a writable host directory at /data (the app
# writes a data self-heal at startup, and WAL needs its -wal/-shm siblings).
ENV NODE_ENV=production \
    DATABASE_URL=file:/data/quran.db \
    DB_SKIP_MIGRATIONS=true
USER node
WORKDIR /repo/apps/web
EXPOSE 3000
# /surah/1 reads the DB, so a missing or unreadable mount reports unhealthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:3000/surah/1').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Start through pnpm's bin shim, not `pnpm exec`: corepack's pnpm is cached for
# root, so as USER node it re-downloads pnpm on every start (needs internet).
# Not `node .../next/dist/bin/next` either: the shim's NODE_PATH is what
# resolves the externalized @libsql/client (a packages/data dep, not web's).
# The shim ends in `exec node`, so node is still PID 1 and gets SIGTERM.
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
