import { useRef } from 'react';
import { Pressable, TextInput } from 'react-native';

import { GlassSurface } from './GlassSurface';
import { Icon } from './icons/Icon';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface SearchFieldProps {
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  clearAccessibilityLabel: string;
  autoFocus?: boolean;
  testID?: string;
  clearTestID?: string;
}

/**
 * The one search field.
 *
 * There were three, all hand-rolled: the dictionary's glass row with a clear
 * button and no magnifier, the search screen's accent-bordered glass with
 * neither, and the surah filter's bordered chip with neither. Only the
 * dictionary could be cleared, and the search screen -- the screen whose whole
 * job is searching -- looked unlike every other (owner, device, 2026-09-22).
 *
 * The glass sits on the row rather than on the input, so the magnifier and the
 * clear button read as being inside the field. `clearButtonMode` is not an
 * option: it is iOS-only and this app ships Android first.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  clearAccessibilityLabel,
  autoFocus = false,
  testID,
  clearTestID,
}: SearchFieldProps) {
  const theme = useThemeColors();
  const inputRef = useRef<TextInput>(null);

  return (
    <GlassSurface style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 4 }}>
      <Icon name="search" color={theme.mutedText} size={20} />
      <TextInput
        ref={inputRef}
        {...(testID ? { testID } : {})}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedText}
        autoFocus={autoFocus}
        accessibilityLabel={accessibilityLabel}
        style={{
          flex: 1,
          color: theme.text,
          paddingHorizontal: 10,
          minHeight: touchTargets.minimum,
          fontSize: typography.body,
        }}
      />
      {value.length > 0 ? (
        <Pressable
          {...(clearTestID ? { testID: clearTestID } : {})}
          accessibilityRole="button"
          accessibilityLabel={clearAccessibilityLabel}
          // Focus goes straight back to the field: clearing is a correction
          // mid-thought, not the end of a search, so the keyboard staying up is
          // the difference between one tap and three (owner ruling R8).
          onPress={() => {
            onChangeText('');
            inputRef.current?.focus();
          }}
          // A bare ✕ glyph is a ~14pt target; the minimums are what keep it
          // above the 48dp floor the rest of the app holds to.
          style={{
            minHeight: touchTargets.minimum,
            minWidth: touchTargets.minimum,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="close" color={theme.mutedText} size={18} />
        </Pressable>
      ) : null}
    </GlassSurface>
  );
}
