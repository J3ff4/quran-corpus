import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { LetterScreen } from '@/screens/LetterScreen';
import { parseLetterParam } from '@/data/routeParams';

export default function LetterRoute() {
  const params = useLocalSearchParams<{ letter: string }>();
  const letter = useMemo(() => parseLetterParam(params.letter), [params.letter]);

  return <LetterScreen letter={letter} />;
}
