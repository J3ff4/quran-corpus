import { useLocalSearchParams } from 'expo-router';
import { LemmaScreen } from '@/screens/LemmaScreen';
import { parseLemmaParam } from '@/data/routeParams';

/** Untrusted: a path segment off a deep link. `parseLemmaParam` takes the raw
 *  `useLocalSearchParams` value, array and `undefined` cases included, so the
 *  guard that stops `'undefined'` and `'qAl,mA'` reaching SQLite lives in the
 *  validator rather than being re-typed at each route. Same validator the root
 *  route uses. */
export default function LemmaRoute() {
  const params = useLocalSearchParams<{ lemma: string }>();

  return <LemmaScreen lemmaBuckwalter={parseLemmaParam(params.lemma)} />;
}
