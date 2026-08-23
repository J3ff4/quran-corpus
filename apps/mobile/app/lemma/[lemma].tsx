import { useLocalSearchParams } from 'expo-router';
import { LemmaScreen } from '@/screens/LemmaScreen';
import { parseFrequencySourceParam, parseLemmaParam } from '@/data/routeParams';

/** Untrusted: a path segment off a deep link. `parseLemmaParam` takes the raw
 *  `useLocalSearchParams` value, array and `undefined` cases included, so the
 *  guard that stops `'undefined'` and `'qAl,mA'` reaching SQLite lives in the
 *  validator rather than being re-typed at each route. Same validator the root
 *  route uses. */
export default function LemmaRoute() {
  const params = useLocalSearchParams<{ lemma: string; from?: string }>();

  return (
    <LemmaScreen
      lemmaBuckwalter={parseLemmaParam(params.lemma)}
      // Untrusted for the same reason the path segment is: `?from` is whatever
      // a deep link carried. Anything but the two rankings resolves to null,
      // which dims both arrows rather than guessing a ranking for the reader.
      source={parseFrequencySourceParam(params.from)}
    />
  );
}
