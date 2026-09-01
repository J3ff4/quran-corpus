import { Pressable, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icons/Icon';
import { usePressScaleStyle } from '@/motion/usePressScale';
import { radii, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** One row inside a bottom sheet: a choice in a picker, or a way out of it.
 *
 *  Rows rather than pills for a picker (owner ruling D52): a reciter label runs
 *  to 33 characters, where LanguageSelector's pills hold six. Same
 *  accessibility contract as those pills -- radio role, selection state -- and
 *  a different shape. */
export interface SheetRowProps {
  label: string;
  onPress: () => void;
  /** Set for an exclusive choice; makes the row a radio and draws the check. */
  selected?: boolean;
  /** 'radio' for a picker, 'button' for a navigation action. Default 'button'. */
  role?: 'radio' | 'button';
  trailingIcon?: IconName;
  testID?: string;
}

export function SheetRow({
  label,
  onPress,
  selected = false,
  role = 'button',
  trailingIcon,
  testID,
}: SheetRowProps) {
  const theme = useThemeColors();
  const pressStyle = usePressScaleStyle();
  // check for the chosen one, whatever the caller asked for otherwise.
  const icon = selected ? 'check' : trailingIcon;

  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      // checked as well as selected: TalkBack reads the two differently
      // depending on the role, and a radio with only `selected` announces
      // nothing about its state on some builds.
      accessibilityState={role === 'radio' ? { selected, checked: selected } : undefined}
      // The label alone. The check is decorative here -- the state is already
      // carried by accessibilityState, and announcing both says it twice.
      accessibilityLabel={label}
      onPress={onPress}
      style={(state) => [
        {
          minHeight: touchTargets.minimum,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingHorizontal: 12,
          borderRadius: radii.chip,
          backgroundColor: selected ? theme.accentWash : 'transparent',
        },
        pressStyle(state),
      ]}
    >
      <Text
        style={{
          color: selected ? theme.accent : theme.text,
          fontSize: typography.body,
          fontWeight: selected ? '700' : '400',
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
      {icon ? (
        <View>
          {/* testID passed explicitly: Icon spreads the prop only when given,
              so an omitted one is not queryable and the selection test above
              would pass against a row that drew nothing. */}
          <Icon
            testID={`icon-${icon}`}
            name={icon}
            color={selected ? theme.accent : theme.mutedText}
            size={20}
          />
        </View>
      ) : null}
    </Pressable>
  );
}
