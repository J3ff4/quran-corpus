import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Nonce-based CSP (middleware.ts) requires per-request rendering: a statically
// prerendered page ships Next's inline bootstrap scripts with NO nonce, the
// strict prod script-src ('self' 'nonce-…', no 'unsafe-inline') blocks them,
// and the page hydrates to blank — app-wide, since / is the entry point.
//
// A parent layout's `force-dynamic` can't be overridden back to static by a
// child (Next resolves the subtree dynamic), and /offline must stay static to
// be precached as the SW fallback — so we can't fix this once in the root
// layout. Instead every page declares its render mode explicitly, and this test
// fails the build if a new page forgets, so the blank can't silently return.
//
// Dynamic-segment routes ([param]) render dynamically by default and are
// exempt. ponytail: ceiling — a [param] route that later adds
// generateStaticParams could prerender static and slip past this; annotate such
// a route with an explicit `dynamic` export if you add one.

// vitest root is apps/web (see vitest.config.ts).
const appDir = join(process.cwd(), 'src', 'app');

function pageFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((p) => p.endsWith('page.tsx'))
    .map((p) => join(dir, p));
}

describe('route render mode', () => {
  const files = pageFiles(appDir).filter((f) => !f.includes('['));

  it('finds the paramless page files it is meant to guard', () => {
    // Sanity: if globbing breaks and returns nothing, the assertions below pass
    // vacuously. Fail loudly instead.
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s declares an explicit render mode', (file) => {
    const src = readFileSync(file, 'utf8');
    expect(src).toMatch(/export const dynamic\s*=\s*'force-(dynamic|static)'/);
  });
});
