import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { parseAyahNumber, parseSurahId } from '@/data/routeParams';
import { WbwScreen } from '@/screens/WbwScreen';

export default function WbwRoute() {
  const params = useLocalSearchParams<{ surahId: string; from?: string }>();
  const surahId = useMemo(() => parseSurahId(params.surahId), [params.surahId]);
  // Arrives from a deep link, so it is untrusted input even though the reader
  // and the morphology tab are the only writers of these links. Past the end
  // of a short surah it is clamped by getWbwScreen, not rejected here --
  // parseAyahNumber cannot know which surah it is bounding.
  const from = useMemo(() => parseAyahNumber(params.from) ?? 1, [params.from]);

  return <WbwScreen surahId={surahId} from={from} />;
}
