import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as clientEntry from '../src/client.js';

// The `@quran-corpus/data/client` entry is the ONLY data import that client
// components (SearchSheet, DictionaryBrowser) may use. It must stay DB-free:
// if it (transitively) pulls `@libsql/client` in, the node-only driver ends up
// in the browser bundle and every interactive element fails to hydrate.
describe('client entry (browser-safe)', () => {
  it('exposes the pure values client components need', () => {
    expect(clientEntry.EMPTY_SEARCH_RESULT).toEqual({ jump: null, verses: [], roots: [] });
    expect(clientEntry.rootFirstLetter('rHm')).toBeTypeOf('string');
    expect(clientEntry.compareRootsArabic('a', 'b')).toBeTypeOf('number');
  });

  it('does not statically import the DB driver anywhere in its module graph', () => {
    // Walk the source graph from client.ts; every reachable file must be free
    // of `@libsql/client`. Guards against re-adding a barrel/query import.
    const seen = new Set<string>();
    const visit = (spec: string) => {
      const path = fileURLToPath(new URL(spec, import.meta.url));
      if (seen.has(path)) return;
      seen.add(path);
      const src = readFileSync(path, 'utf8');
      // A *value* import of the driver is the poison; `import type` is erased
      // at build time and comments/prose are harmless.
      const valueImport = /^\s*import\s+(?!type\b)[^;]*from\s+['"]@libsql\/client['"]/m;
      expect(src, `${spec} must not value-import @libsql/client`).not.toMatch(valueImport);
      for (const m of src.matchAll(/from '(\.[^']+)\.js'/g)) {
        visit(`${dir(spec)}${m[1]}.ts`);
      }
    };
    const dir = (spec: string) => spec.slice(0, spec.lastIndexOf('/') + 1);
    visit('../src/client.ts');
  });
});
