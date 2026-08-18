import { Text, type TextStyle } from 'react-native';

// FTS5's snippet() wraps each matched token in these. They are control
// characters, not markup: rendered as text they show as a box glyph, and
// treated as markup they would be an injection point. Split on them instead.
const START = '';
const END = '';

export interface SnippetTextProps {
  snippet: string;
  highlightColor: string;
  style?: TextStyle;
}

/** One FTS snippet with its matched tokens tinted. */
export function SnippetText({ snippet, highlightColor, style }: SnippetTextProps) {
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
            <Text testID="snippet-mark" style={{ color: highlightColor, fontWeight: '700' }}>
              {matched}
            </Text>
            {rest.join(END)}
          </Text>
        );
      })}
    </Text>
  );
}
