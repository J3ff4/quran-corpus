import { Pressable, Text, View } from 'react-native';
import { ARABIC_ALPHABET_ORDER } from '@quran-corpus/data/mobile';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface AlphabetGridProps {
  onSelect: (letter: string) => void;
}

/** The hijāʾī grid. Letters come from the shared order, so these buckets are
 *  the ones rootFirstLetter actually assigns. */
export function AlphabetGrid({ onSelect }: AlphabetGridProps) {
  const theme = useThemeColors();

  return (
    <View
      // RTL reading order: the alphabet starts at the top right.
      style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, padding: 16 }}
    >
      {ARABIC_ALPHABET_ORDER.map((letter) => (
        <Pressable
          key={letter}
          testID="alphabet-cell"
          accessibilityRole="button"
          accessibilityLabel={letter}
          onPress={() => onSelect(letter)}
          style={{
            minWidth: touchTargets.minimum,
            minHeight: touchTargets.minimum,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ color: theme.text, fontFamily: 'Hafs', fontSize: typography.body }}>
            {letter}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
