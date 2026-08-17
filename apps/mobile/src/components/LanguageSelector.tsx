import { Pressable, Text, View } from 'react-native';
import { contentLanguages, type ContentLanguageCode } from '@/i18n/languages';
import { touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

interface LanguageSelectorProps {
  value: ContentLanguageCode;
  onChange: (language: ContentLanguageCode) => void;
}

export function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  const theme = useThemeColors();
  return (
    <View
      accessibilityRole="radiogroup"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingVertical: 12 }}
    >
      {contentLanguages.map((item) => (
        <Pressable
          key={item.code}
          // radio, not button: these are an exclusive choice, and the radio
          // role is what tells a screen reader "1 of 3" instead of leaving
          // selection state as an afterthought on a button.
          accessibilityRole="radio"
          accessibilityState={{ selected: item.code === value, checked: item.code === value }}
          onPress={() => onChange(item.code)}
          style={{
            minHeight: touchTargets.minimum,
            borderRadius: 20,
            paddingHorizontal: 14,
            justifyContent: 'center',
            backgroundColor: item.code === value ? theme.accent : theme.surface,
          }}
        >
          <Text style={{ color: item.code === value ? theme.onAccent : theme.text }}>{item.nativeLabel}</Text>
        </Pressable>
      ))}
    </View>
  );
}
