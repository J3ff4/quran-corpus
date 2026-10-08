import { Text } from 'react-native';
import { splitGlossBrackets } from '@quran-corpus/data/mobile';
import { useThemeColors } from '@/theme/themeContext';

/** A gloss's text with bracketed asides in mutedText (R13). Rendered INSIDE the host's
 *  own <Text>, so line clamping and size are the host's -- colour is the only change.
 *  Nested Text is safe here: it breaks shaping across Arabic runs, and a gloss is not. */
export function GlossRuns({ text }: { text: string }) {
  const theme = useThemeColors();
  return (
    <>
      {splitGlossBrackets(text).map((run, i) =>
        run.dim ? (
          <Text key={i} style={{ color: theme.mutedText }}>
            {run.text}
          </Text>
        ) : (
          run.text
        ),
      )}
    </>
  );
}
