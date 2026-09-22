import { useState, type ReactNode } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Collapsible } from './Collapsible';
import { GlassSurface } from './GlassSurface';
import { Icon } from './icons/Icon';
import { t } from '@/i18n/uiStrings';
import type { UiLocaleCode } from '@/i18n/languages';
import { fonts, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface HeaderCardProps {
  /** The screen's subject, centred on the first row. */
  title: string;
  /** A scroll-linked fade, authored by the caller where the offset lives. The
   *  reader fades its name in as the list's own heading leaves; a screen whose
   *  heading is only ever in the bar passes nothing. */
  titleStyle?: StyleProp<ViewStyle>;
  /** Whether the name is on screen. Drives whether it takes presses: faded
   *  out, a pressable title is an invisible hit target across the middle of
   *  the bar and a control TalkBack offers for something the eye cannot see. */
  titleVisible?: boolean;
  /** Omitted, the name is a label and takes no presses -- and draws no caret,
   *  because the caret is what says it is pressable. */
  onTitlePress?: () => void;
  /** The whole utterance for the title control. A Pressable is `accessible` by
   *  default and collapses its descendants, so the Text below is not announced
   *  and this is all TalkBack says -- it must therefore start with the name. */
  titleAccessibilityLabel?: string;
  onBack: () => void;
  uiLocale: UiLocaleCode;
  /** Prefixes every testID: `<prefix>-header`, `-back`, `-title-row`,
   *  `-title`, `-surah-jump`, `-actions`, `-actions-row`. The two screens' suites were written against
   *  their own names and those names are how a device report refers to them. */
  testIDPrefix: string;
  /** The second row, whole. Supplied by the caller rather than composed here
   *  because it is the one part the two screens genuinely differ on: the
   *  reader pages surahs around a mode pill, morphology pages ayah ranges.
   *  It carries its own `marginTop` -- see the note on the surface below. */
  middleRow?: ReactNode;
  /** The curtain's contents. Omitted, no kebab is drawn at all: a button that
   *  unrolls nothing is worse than no button. */
  actions?: ReactNode;
}

/**
 * The chrome every stacked screen wears: one glass card holding back, the
 * screen's name, and a kebab that unrolls the screen's actions.
 *
 * Extracted from ReaderHeader, which is where all of this was designed and
 * where every ruling behind it was made. Morphology had grown its own copy of
 * the same three rows -- bare on the bloom, left-aligned, in the system face
 * rather than the display one -- and read as a different app one push deep
 * (owner, 2026-09-22). §3: the fix for two screens wearing the same chrome
 * differently is one component, not a second styling pass.
 *
 * **Three rows, and the name owns the first one** (owner, device screenshot,
 * 2026-09-11, rulings R1/R2/R4). Seven controls shared that row in the reader
 * before this, which left the name about 34pt -- 'Al-B...' for Al-Baqarah. So
 * the name gets a row, the screen's own paging gets the second, and the
 * actions cost a tap.
 *
 * Published as the navigator's `header` by both callers, not rendered inside
 * the screen: the bar is one glass surface with the bloom showing through,
 * which a native toolbar cannot be, and `headerTransparent` would stop the
 * navigator insetting the content so every heading would draw under the back
 * arrow (see app/_layout.tsx).
 */
export function HeaderCard({
  title,
  titleStyle,
  titleVisible = true,
  onTitlePress,
  titleAccessibilityLabel,
  onBack,
  uiLocale,
  testIDPrefix,
  middleRow,
  actions,
}: HeaderCardProps) {
  const theme = useThemeColors();
  const insets = useSafeAreaInsets();
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    // The inset lives outside the glass, not as padding inside it: a bar that
    // starts under the status bar and pads its own content down draws a tinted
    // strip behind the clock.
    <View
      testID={`${testIDPrefix}-header`}
      style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8 }}
    >
      {/* No `gap` on the surface: the curtain below is a zero-height flex child
          while it is shut, and a gap would still be paid for it -- 10pt of
          dead space under the middle row whenever the actions are closed. The
          rows carry their own spacing instead. */}
      <GlassSurface radius="card" style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        <View
          testID={`${testIDPrefix}-title-row`}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <Pressable
            testID={`${testIDPrefix}-back`}
            accessibilityRole="button"
            accessibilityLabel={t(uiLocale, 'reader.back')}
            onPress={onBack}
            style={{
              minHeight: touchTargets.minimum,
              minWidth: touchTargets.minimum,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="back" color={theme.text} />
          </Pressable>
          {/* Always mounted, at whatever opacity the caller's fade asks for:
              TalkBack then always has the screen's name in the bar, and the
              fade costs no re-render.

              `title` (24) in the display face rather than `body` in the system
              one: the name is the only thing on this row, and at 16 it read as
              a caption rather than as the screen's subject. */}
          <Pressable
            testID={`${testIDPrefix}-surah-jump`}
            accessibilityRole="button"
            accessibilityLabel={titleAccessibilityLabel ?? title}
            disabled={!titleVisible || !onTitlePress}
            accessibilityElementsHidden={!titleVisible}
            importantForAccessibility={titleVisible ? 'auto' : 'no-hide-descendants'}
            {...(onTitlePress ? { onPress: onTitlePress } : {})}
            style={{ flex: 1 }}
          >
            {/* The caret is the affordance (owner, 2026-09-12): a tappable
                name with nothing to say so is a control nobody finds. It sits
                inside the faded View rather than beside it, so it disappears
                with the name -- a caret left behind over an invisible name
                would point at a control that is not taking presses.

                A row View wrapping the text, not two siblings: one opacity
                drives both, and the name stays centred with the caret trailing
                it rather than the pair being centred as a block, which walked
                the name off-centre by half the caret. */}
            <Animated.View
              style={[
                titleStyle,
                { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
              ]}
            >
              <Text
                testID={`${testIDPrefix}-title`}
                numberOfLines={1}
                style={{
                  textAlign: 'center',
                  color: theme.text,
                  fontFamily: fonts.display,
                  fontSize: typography.title,
                  flexShrink: 1,
                }}
              >
                {title}
              </Text>
              {onTitlePress ? <Icon name="chevronDown" size={14} color={theme.mutedText} /> : null}
            </Animated.View>
          </Pressable>
          {/* One button for the screen's actions (ruling R1). A kebab: not a
              gear, because Settings is a real screen here and a gear would
              promise it, and not `menu`, whose three lines are Android's
              nav-drawer glyph and promised a drawer (owner, device,
              2026-09-11). */}
          {actions ? (
            <Pressable
              testID={`${testIDPrefix}-actions`}
              accessibilityRole="button"
              accessibilityState={{ expanded: actionsOpen }}
              accessibilityLabel={t(
                uiLocale,
                actionsOpen ? 'reader.hideActions' : 'reader.showActions',
              )}
              onPress={() => setActionsOpen((open) => !open)}
              style={{
                minHeight: touchTargets.minimum,
                minWidth: touchTargets.minimum,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={actionsOpen ? 'close' : 'kebab'} color={theme.text} />
            </Pressable>
          ) : (
            // The back button's width, so the name is centred in the bar
            // rather than in what is left of it.
            <View style={{ width: touchTargets.minimum }} />
          )}
        </View>
        {middleRow}
        {actions ? (
          <Collapsible open={actionsOpen} testID={`${testIDPrefix}-actions-row`}>
            {actions}
          </Collapsible>
        ) : null}
      </GlassSurface>
    </View>
  );
}
