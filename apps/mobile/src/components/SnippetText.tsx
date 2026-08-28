import { Text, type TextStyle } from 'react-native';

// FTS5's snippet() wraps each matched token in these. They are control
// characters, not markup: rendered as text they show as a box glyph, and
// treated as markup they would be an injection point. Split on them instead.
const START = '';
const END = '';

export interface SnippetTextProps {
  snippet: string;
  highlightColor: string;
  /** Wash behind the matched tokens. Optional: the weight below is the signal
   *  that is not colour (WCAG 1.4.1), so a caller with nowhere to put a wash
   *  still marks the match legibly. Same treatment ConcordanceList gives its
   *  own matched word. */
  highlightBackground?: string;
  style?: TextStyle;
}

/** One FTS snippet with its matched tokens tinted. */
export function SnippetText({
  snippet,
  highlightColor,
  highlightBackground,
  style,
}: SnippetTextProps) {
  const parts = snippet.split(START);

  return (
    <Text testID="snippet" style={style}>
      {parts.map((part, index) => {
        if (index === 0) return part;
        const [matched, ...rest] = part.split(END);
        return (
          // Index keys: the parts have no identity of their own, and the whole
          // list is rebuilt on every new snippet.
          <Text key={index}>
            <Text
              testID="snippet-mark"
              style={{
                color: highlightColor,
                fontWeight: '700',
                ...(highlightBackground ? { backgroundColor: highlightBackground } : null),
              }}
            >
              {matched}
            </Text>
            {rest.join(END)}
          </Text>
        );
      })}
    </Text>
  );
}
