/** Split a gloss into plain and bracketed runs, so a renderer can dim the translator's
 *  asides -- "(the) Symbols", "[знайте]" -- without touching the words the Arabic says.
 *
 *  Brackets dim WITH their content, and nesting dims as one outer run (owner R13).
 *  Round and square brackets count as one depth, since no measured gloss mixes them
 *  unbalanced. An unclosed opener or a stray closer is left plain, never "dim to the
 *  end": a typo must not grey out half a gloss. The runs always re-join to the input. */
export interface GlossRun {
  text: string;
  dim: boolean;
}

export function splitGlossBrackets(gloss: string): GlossRun[] {
  const runs: GlossRun[] = [];
  const push = (text: string, dim: boolean) => {
    if (!text) return;
    const last = runs[runs.length - 1];
    if (last && last.dim === dim) last.text += text;
    else runs.push({ text, dim });
  };
  let depth = 0;
  let from = 0;
  for (let i = 0; i < gloss.length; i += 1) {
    const ch = gloss[i]!;
    if (ch === '(' || ch === '[') {
      if (depth === 0) {
        push(gloss.slice(from, i), false);
        from = i;
      }
      depth += 1;
    } else if ((ch === ')' || ch === ']') && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        push(gloss.slice(from, i + 1), true);
        from = i + 1;
      }
    }
  }
  push(gloss.slice(from), false);
  return runs;
}
