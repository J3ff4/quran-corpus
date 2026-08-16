import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { posColors, formColors, easeOut } from '@quran-corpus/config/theme/palette';

// apps/web/vitest.config.mts is ESM, so there is no __dirname here.
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '../app/globals.css'), 'utf8');

/** All `--token: value;` declarations, in file order, split by whether they
 *  sit inside the dark-mode block. */
function declarations(prefix: string) {
  // The selector, not a bare '.dark' -- the comment above it mentions the
  // .dark class by name and would match first.
  const darkStart = css.indexOf(':root.dark');
  const found: { name: string; value: string; dark: boolean }[] = [];
  const re = new RegExp(`--(${prefix}-[a-z-]+):\\s*([^;]+);`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(css))) {
    found.push({ name: match[1]!, value: match[2]!.trim(), dark: match.index > darkStart });
  }
  return found;
}

describe('globals.css / palette.ts parity', () => {
  it('keeps every --pos-* token equal to the palette', () => {
    // The palette is the source of truth for mobile; globals.css is the copy
    // web's Tailwind build reads. Editing one and not the other renders the
    // same grammatical category in two different colours across the products,
    // and nothing else in the build would catch it.
    for (const { name, value, dark } of declarations('pos')) {
      const bucket = name.replace('pos-', '') as keyof typeof posColors.light;
      expect(value.toLowerCase()).toBe(
        (dark ? posColors.dark : posColors.light)[bucket].toLowerCase(),
      );
    }
  });

  it('covers every bucket the palette defines, in both themes', () => {
    // The loop above passes vacuously if globals.css declares nothing at all.
    const found = declarations('pos');
    expect(found.filter((d) => !d.dark)).toHaveLength(Object.keys(posColors.light).length);
    expect(found.filter((d) => d.dark)).toHaveLength(Object.keys(posColors.dark).length);
  });

  it('keeps every --form-* token equal to the palette', () => {
    for (const { name, value, dark } of declarations('form')) {
      const key = name.replace('form-', '') as keyof typeof formColors.light;
      expect(value.toLowerCase()).toBe(
        (dark ? formColors.dark : formColors.light)[key].toLowerCase(),
      );
    }
  });

  it('covers every derived form the palette defines, in both themes', () => {
    const found = declarations('form');
    expect(found.filter((d) => !d.dark)).toHaveLength(Object.keys(formColors.light).length);
    expect(found.filter((d) => d.dark)).toHaveLength(Object.keys(formColors.dark).length);
  });

  it('keeps --ease-out equal to the palette', () => {
    expect(css).toContain(`--ease-out: ${easeOut};`);
  });
});
