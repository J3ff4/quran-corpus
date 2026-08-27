import { Text } from 'react-native';

import { GlassSurface } from './GlassSurface';
import { fonts, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface SlimHeaderProps {
  /** The screen's name, set as an uppercase eyebrow on the left. */
  title: string;
  /** Right-aligned caption: a count, a sort order, a rank. Optional -- not
   *  every screen has a number that belongs beside its name. */
  caption?: string;
  testID?: string;
}

/**
 * The slim glass bar every corpus screen wears instead of a masthead.
 *
 * Owner ruling D1 (2026-08-26), on seeing the M6g mockups: the tall
 * "Dictionary / 1,642 roots" plate was "redundant and ugly". This is what
 * replaced it -- about 90dp shorter, which is one more root row above the
 * fold.
 *
 * No back affordance of its own. The stack in app/_layout.tsx already draws a
 * transparent header with a back arrow and an empty title, so a chevron here
 * would be the second one on screen; on the tab screens there is nothing to go
 * back to.
 */
export function SlimHeader({ title, caption, testID }: SlimHeaderProps) {
  const theme = useThemeColors();

  return (
    <GlassSurface
      radius="pill"
      {...(testID ? { testID } : {})}
      style={{
        marginHorizontal: 16,
        marginTop: 8,
        paddingHorizontal: 18,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      {/* The screen's heading, so TalkBack's heading navigation lands here
          rather than on the first row of the list. */}
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={{
          flexShrink: 1,
          color: theme.text,
          fontFamily: fonts.displaySemiBold,
          fontSize: typography.caption,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
        }}
      >
        {title}
      </Text>
      {caption ? (
        <Text
          testID={testID ? `${testID}-caption` : undefined}
          numberOfLines={1}
          style={{
            color: theme.mutedText,
            fontSize: typography.caption,
            // The caption is usually a count that changes as the reader types.
            // Proportional digits reflow the bar on every keystroke.
            fontVariant: ['tabular-nums'],
          }}
        >
          {caption}
        </Text>
      ) : null}
    </GlassSurface>
  );
}
