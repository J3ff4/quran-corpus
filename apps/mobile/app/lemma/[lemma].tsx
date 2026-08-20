import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { LemmaScreen } from '@/screens/LemmaScreen';
import { parseLemmaParam } from '@/data/routeParams';

/** Untrusted: a path segment off a deep link. `parseLemmaParam` takes a bare
 *  `string`, so calling it directly on `params.lemma` would coerce an
 *  `undefined` param to the literal string `"undefined"` (a valid Buckwalter
 *  identifier) or an array param to a comma-joined one -- both would reach
 *  SQLite. Same guard as apps/mobile/app/root/[buckwalter].tsx, and the same
 *  validator the web lemma page uses. */
export default function LemmaRoute() {
  const params = useLocalSearchParams<{ lemma: string }>();
  const lemmaBuckwalter = useMemo(() => {
    const raw = Array.isArray(params.lemma) ? params.lemma[0] : params.lemma;
    return raw ? parseLemmaParam(raw) : null;
  }, [params.lemma]);

  return <LemmaScreen lemmaBuckwalter={lemmaBuckwalter} />;
}
