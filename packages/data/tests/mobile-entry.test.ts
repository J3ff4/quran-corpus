import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('@quran-corpus/data/mobile', () => {
  it('exports mobile-safe query functions', async () => {
    const mod = await import('../src/mobile');

    expect(typeof mod.getAllSurahs).toBe('function');
    expect(typeof mod.getAyahsBySurah).toBe('function');
    expect(typeof mod.getWordsByAyah).toBe('function');
    expect(typeof mod.getJuzIndex).toBe('function');
    expect(typeof mod.getPageIndex).toBe('function');
    expect(typeof mod.getRevealedIndex).toBe('function');
    expect(typeof mod.getWordDetail).toBe('function');
    expect(typeof mod.getTranslationsBySurahAndLang).toBe('function');
    expect(typeof mod.search).toBe('function');
    expect(typeof mod.getLemmaEntry).toBe('function');
    expect(typeof mod.getLemmaConcordancePage).toBe('function');
    expect(typeof mod.countLemmaConcordance).toBe('function');
    expect(typeof mod.getLemmaFrequency).toBe('function');
    expect(typeof mod.getVerbConcordance).toBe('function');
    expect(typeof mod.isLemmaBuckwalter).toBe('function');
    expect(typeof mod.isRootBuckwalter).toBe('function');
    expect(typeof mod.categorizeFormLabel).toBe('function');
    expect(typeof mod.foldRootArabic).toBe('function');
    // Deliberately absent: they decode, and expo-router has already decoded.
    // See the note on the buckwalter re-export in src/mobile.ts.
    expect('parseLemmaParam' in mod).toBe(false);
    expect('parseRootParam' in mod).toBe(false);
  });

  it('does not export node/libsql runtime helpers', async () => {
    const mod = await import('../src/mobile');

    expect('createDatabase' in mod).toBe(false);
    expect('runMigrations' in mod).toBe(false);
    expect('backfillSearchIndex' in mod).toBe(false);
  });

  // The two cases above only inspect the entry point's own exports, which is
  // the weaker half of the guarantee. Node resolves @libsql/client happily
  // under Vitest, so a *transitive* runtime import would pass both of them and
  // then fail in Metro, on a device, when the RN bundle cannot resolve a node
  // driver. This walks the real import graph instead.
  it('pulls no node-only module into the mobile graph', () => {
    const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
    const entry = resolve(srcRoot, 'mobile.ts');

    const visited = new Set<string>();
    const offenders: string[] = [];
    const queue = [entry];

    while (queue.length > 0) {
      const file = queue.pop();
      if (!file || visited.has(file)) continue;
      visited.add(file);

      for (const specifier of runtimeImportsOf(file)) {
        if (specifier === '@libsql/client') {
          offenders.push(`${relativeToSrc(srcRoot, file)} imports ${specifier}`);
          continue;
        }
        if (!specifier.startsWith('.')) continue;

        // Authored as ESM with .js specifiers; the sources are .ts.
        const resolved = resolve(dirname(file), specifier.replace(/\.js$/, '.ts'));
        const name = relativeToSrc(srcRoot, resolved);
        if (name === 'db.ts' || name === 'migrate.ts') {
          offenders.push(`${relativeToSrc(srcRoot, file)} imports ${name}`);
          continue;
        }
        queue.push(resolved);
      }
    }

    expect(offenders).toEqual([]);
    // Guards the walker itself: if resolution silently produced nothing, the
    // assertion above would pass while checking nothing at all.
    expect(visited.size).toBeGreaterThan(5);
  });

  // The user-DB entry ships in the same Metro bundle as ./mobile, so it needs
  // the same guarantee. It is checked separately rather than walked, because it
  // is meant to stay a leaf: plain SQL over a structural client type, with the
  // only import erased at compile time.
  it('keeps the user-db entry free of runtime imports', () => {
    const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

    expect(runtimeImportsOf(resolve(srcRoot, 'userData.ts'))).toEqual([]);
  });

  it('counts a side-effect import as a runtime import', () => {
    // No `from` clause and no bindings, but Metro still loads the module. The
    // parser used to require `from`, so this class of import was invisible to
    // the graph walk above -- the one thing that walk exists to catch.
    expect(parseRuntimeImports("import './register-node-only.js';")).toEqual(['./register-node-only.js']);
    expect(parseRuntimeImports("import type { Client } from '@libsql/client';")).toEqual([]);
    expect(parseRuntimeImports("export { getSurahById } from './queries/surahs.js';")).toEqual([
      './queries/surahs.js',
    ]);
  });
});

function relativeToSrc(srcRoot: string, file: string): string {
  return file.startsWith(srcRoot) ? file.slice(srcRoot.length + 1) : file;
}

/**
 * Import specifiers that survive to runtime.
 *
 * `import type` / `export type` are erased by the compiler, so they cannot drag
 * anything into the bundle -- roots.ts and search.ts legitimately take a libsql
 * `Client` as a type on their write paths, and flagging those would be wrong.
 */
function runtimeImportsOf(file: string): string[] {
  try {
    return parseRuntimeImports(readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

/** The parsing half, split out so its edge cases are testable without a file. */
function parseRuntimeImports(source: string): string[] {
  const specifiers: string[] = [];
  // The `from` clause is optional: `import './register.js'` is a side-effect
  // import with no bindings, and it pulls the module into the bundle exactly
  // like a named one. The old pattern required `from`, so a single such line
  // anywhere under src/ would have walked straight past this guard and taken a
  // node-only module into the Metro graph with it.
  const pattern = /(?:^|\n)\s*(?:import|export)\s+(?:([^'"]*?)from\s*)?['"]([^'"]+)['"]/g;
  let match = pattern.exec(source);
  while (match) {
    const clause = match[1] ?? '';
    const specifier = match[2];
    if (specifier && !/^\s*type\s/.test(clause)) specifiers.push(specifier);
    match = pattern.exec(source);
  }
  return specifiers;
}
