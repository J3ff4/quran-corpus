import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View, type NativeSyntheticEvent, type TextLayoutEventData } from 'react-native';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

export interface ClampedTextProps {
  children: string;
  /** Lines shown while collapsed. */
  lines?: number;
  /** Rendered at the leading edge of the toggle's row, e.g. the source credit,
   *  so the credit and the toggle cost one line between them. Shown whether or
   *  not the text overflows. */
  footer?: ReactNode;
  uiLocale: UiLocaleCode;
}

const DEFAULT_LINES = 6;

/** Collapses long prose to `lines` with a Show more/less toggle, and gets out
 *  of the way when the text already fits.
 *
 *  Overflow is decided from the text `onTextLayout` reports, NOT from
 *  `lines.length`: with `numberOfLines` set, Android reports only the lines it
 *  rendered, so a length test reads 6 whether or not anything was cut and the
 *  toggle never appears. Comparing the joined line text against the source is
 *  exact on both platforms and needs no unclamped measuring pass -- which is
 *  the other reason not to do it that way: a pre-pass would paint the whole
 *  1479-character definition for one frame before collapsing it. */
export function ClampedText({ children, lines = DEFAULT_LINES, footer, uiLocale }: ClampedTextProps) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  // Different text is a different measurement. Neither state survives the swap:
  // `overflows` is sticky by design (see onTextLayout) and would otherwise keep
  // a Show more button over text that now fits, and a carried-over `expanded`
  // would lock out the re-measure as well. Adjusted during render rather than
  // in an effect so the new text never paints under the old verdict -- React's
  // documented pattern for state that depends on a prop.
  const measured = useRef(children);
  if (measured.current !== children) {
    measured.current = children;
    setExpanded(false);
    setOverflows(false);
  }

  const onTextLayout = useCallback(
    (event: NativeSyntheticEvent<TextLayoutEventData>) => {
      // Once true it stays true. The expanded render lays out every line, so
      // re-deciding here would read "it all fits" and delete the Show less
      // button out from under the reader mid-read.
      if (expanded || overflows) return;
      const shown = event.nativeEvent.lines
        .map((line) => line.text)
        .join('')
        // Android appends the ellipsis to the truncated line; it is not part
        // of the source string and would make a fitting text look longer.
        .replace(/…\s*$/, '');
      setOverflows(shown.trim().length < children.trim().length);
    },
    [children, expanded, overflows],
  );

  const label = t(uiLocale, expanded ? 'text.showLess' : 'text.showMore');

  return (
    <>
      <Text
        testID="clamp-body"
        accessibilityState={{ expanded }}
        numberOfLines={expanded ? undefined : lines}
        onTextLayout={onTextLayout}
        style={{ color: theme.text, fontSize: typography.body, lineHeight: 24 }}
      >
        {children}
      </Text>
      {footer || overflows ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <View testID="clamp-footer">{footer}</View>
          {overflows ? (
            <Pressable
              testID="clamp-toggle"
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ expanded }}
              onPress={() => setExpanded((value) => !value)}
              style={{ minHeight: touchTargets.compact, justifyContent: 'center' }}
            >
              <Text style={{ color: theme.accent, fontSize: typography.caption }}>{label}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </>
  );
}
