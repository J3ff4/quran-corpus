/** Split a run of words into the spans one gloss covers.
 *
 *  Tasnim glosses phrases, not always single words: "shubha yo'q" is one gloss
 *  over both لَا and رَيْبَ, and `gloss_group` is what says so. Words outside
 *  any span carry a NULL group and each stand alone -- two words glossed with
 *  the same WORD are still two glosses, so the id is the only signal here,
 *  never the text.
 *
 *  Grouping is per language, because the group ids are: switching language
 *  re-reads the glosses and regroups with them. Ids are also scoped per ayah,
 *  so only ever pass one ayah's words.
 *
 *  Generic over the item because web and mobile hold a word in different
 *  shapes -- a `WbwCell` and a `Word` plus a gloss map -- while the rule that
 *  splits them is the same rule. `groupOf` is how each says where its id lives.
 */
export function groupByGlossSpan<T>(
  items: readonly T[],
  groupOf: (item: T) => number | null,
): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    // Adjacency is required, not assumed. A span is contiguous by
    // construction; joining a non-adjacent repeat of an id would swallow
    // whatever word sits between the two halves.
    if (groupOf(item) !== null && last && groupOf(last[0]!) === groupOf(item)) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups;
}
