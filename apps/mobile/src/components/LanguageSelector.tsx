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
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingVertical: 12 }}>
      {contentLanguages.map((item) => (
        <Pressable
          key={item.code}
          accessibilityRole="button"
          accessibilityState={{ selected: item.code === value }}
          onPress={() => onChange(item.code)}
          style={{
            minHeight: touchTargets.compact,
            borderRadius: 20,
            paddingHorizontal: 14,
            justifyContent: 'center',
            backgroundColor: item.code === value ? theme.accent : theme.surface,
          }}
        >
          <Text style={{ color: item.code === value ? 'white' : theme.text }}>{item.nativeLabel}</Text>
        </Pressable>
      ))}
    </View>
  );
}
