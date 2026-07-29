import { Pressable, Text, View } from 'react-native';
import { contentLanguages, type ContentLanguageCode } from '@/i18n/languages';
import { colors, touchTargets } from '@/theme/tokens';

interface LanguageSelectorProps {
  value: ContentLanguageCode;
  onChange: (language: ContentLanguageCode) => void;
}

export function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingVertical: 12 }}>
      {contentLanguages.map((item) => (
        <Pressable
          key={item.code}
          accessibilityRole="button"
          onPress={() => onChange(item.code)}
          style={{
            minHeight: touchTargets.compact,
            borderRadius: 20,
            paddingHorizontal: 14,
            justifyContent: 'center',
            backgroundColor: item.code === value ? colors.accent : '#ede6d8',
          }}
        >
          <Text style={{ color: item.code === value ? 'white' : colors.ink }}>{item.nativeLabel}</Text>
        </Pressable>
      ))}
    </View>
  );
}
