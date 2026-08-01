import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Companion to packages/data/tests/client-entry.test.ts. That one guards the
// *inside* of the browser-safe entry point (nothing in its graph may reach the
// libsql driver); this one guards the *outside* — that client components
// actually import from it. Together they are what keeps the driver out of the
// browser bundle, where it breaks hydration app-wide.
//
// The rule is stricter than the runtime hazard on purpose: `import type` is
// erased at build time and cannot pull the driver in, but "types from the
// barrel, values from /client" is a split nobody remembers, and a value import
// added later to an existing type-only line reads as a one-word edit. One path
// per client file means the mistake has to be made deliberately.

// vitest runs this suite under jsdom, where `import.meta.url` is not a file:
// URL; its root is apps/web, so resolve from cwd instead.
const SRC = join(process.cwd(), 'src');
// Trailing separator: a bare prefix match would also swallow a sibling named
// `src/test-utils/`, which is app source and must stay scanned.
const TEST_DIR = join(SRC, 'test') + sep;

// .js/.jsx too — none exist today, but the day one appears is exactly the day
// nobody remembers this file only looked at TypeScript.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

describe("'use client' files and the data package", () => {
  it('import from @quran-corpus/data/client, never the barrel', () => {
    const barrel = /from\s+['"]@quran-corpus\/data['"]/;
    const offenders = sourceFiles(SRC)
      .filter((path) => !path.startsWith(TEST_DIR))
      .filter((path) => {
        const src = readFileSync(path, 'utf8');
        return /^\s*['"]use client['"]/m.test(src) && barrel.test(src);
      })
      .map((path) => relative(SRC, path));

    expect(offenders, 'use @quran-corpus/data/client in these files').toEqual([]);
  });
});
