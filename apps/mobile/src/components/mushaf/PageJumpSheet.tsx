import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { MUSHAF_PAGE_MAX, MUSHAF_PAGE_MIN } from '@quran-corpus/data/mobile';

import { BottomSheet } from '@/components/BottomSheet';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SheetActions, SheetHeader } from '@/components/sheet';
import type { UiLocaleCode } from '@/i18n/languages';
import { t, type UiStringKey } from '@/i18n/uiStrings';
import { radii, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** What the reader can jump by, and the range each one accepts.
 *
 *  Facts about the mushaf, not about the loaded index: 604 pages, 114 surahs,
 *  30 juz. `getMushafPage` validates the page again in packages/data (M7b),
 *  and that is the point -- this is the boundary that has to turn a bad value
 *  into a message rather than into a thrown error the reader sees (§3 OWASP:
 *  validate at every boundary, and reject rather than pass through). */
const KINDS = {
  page: { min: MUSHAF_PAGE_MIN, max: MUSHAF_PAGE_MAX, label: 'mushaf.jumpPage' },
  surah: { min: 1, max: 114, label: 'mushaf.jumpSurah' },
  juz: { min: 1, max: 30, label: 'mushaf.jumpJuz' },
} as const satisfies Record<string, { min: number; max: number; label: UiStringKey }>;

export type JumpKind = keyof typeof KINDS;

export interface PageJumpSheetProps {
  uiLocale: UiLocaleCode;
  onClose: () => void;
  /** A validated target. The screen turns it into a page from the loaded
   *  index -- no new query. */
  onJump: (kind: JumpKind, value: number) => void;
}

/** Digits only, and an integer inside the kind's range. Anything else -- a
 *  decimal, a sign, whitespace, 605 -- is null, and the sheet says so instead
 *  of handing it on. */
export function parseJumpTarget(kind: JumpKind, raw: string): number | null {
  if (!/^\d{1,4}$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  const { min, max } = KINDS[kind];
  return value >= min && value <= max ? value : null;
}

/** The mushaf's jump control (M7d ruling 6): page, surah or juz. */
export function PageJumpSheet({ uiLocale, onClose, onJump }: PageJumpSheetProps) {
  const theme = useThemeColors();
  const [kind, setKind] = useState<JumpKind>('page');
  const [raw, setRaw] = useState('');
  const [rejected, setRejected] = useState(false);

  const submit = () => {
    const value = parseJumpTarget(kind, raw);
    if (value === null) {
      setRejected(true);
      return;
    }
    onJump(kind, value);
  };

  return (
    <BottomSheet onClose={onClose} closeLabel={t(uiLocale, 'word.close')}>
      <SheetHeader title={t(uiLocale, 'mushaf.jumpTitle')} />
      <SegmentedControl
        options={(Object.keys(KINDS) as JumpKind[]).map((value) => ({
          value,
          label: t(uiLocale, KINDS[value].label),
        }))}
        value={kind}
        accessibilityLabel={t(uiLocale, 'mushaf.jumpTitle')}
        onChange={(next) => {
          setKind(next);
          // The number means something else now. Keeping it would let "5"
          // typed as a page be submitted as a surah on the next tap.
          setRaw('');
          setRejected(false);
        }}
      />
      <TextInput
        testID="jump-input"
        value={raw}
        onChangeText={(next) => {
          setRaw(next);
          setRejected(false);
        }}
        onSubmitEditing={submit}
        keyboardType="number-pad"
        // The range, as the field's own label: a reader who has just been told
        // "1-604" should not have to open the error to learn it again.
        accessibilityLabel={`${t(uiLocale, KINDS[kind].label)} ${KINDS[kind].min}-${KINDS[kind].max}`}
        placeholder={`${KINDS[kind].min}-${KINDS[kind].max}`}
        placeholderTextColor={theme.mutedText}
        style={{
          minHeight: touchTargets.minimum,
          borderRadius: radii.chip,
          borderWidth: 1,
          borderColor: rejected ? theme.danger : theme.border,
          paddingHorizontal: 14,
          color: theme.text,
          fontSize: typography.body,
        }}
      />
      {rejected ? (
        <Text
          testID="jump-error"
          // Announced when it appears: it lands after the button was pressed,
          // and a reader who cannot see it would otherwise get silence.
          accessibilityLiveRegion="polite"
          style={{ color: theme.danger, fontSize: typography.caption }}
        >
          {t(uiLocale, 'mushaf.jumpOutOfRange')}
        </Text>
      ) : null}
      <SheetActions
        cancelLabel={t(uiLocale, 'bookmarks.cancel')}
        onCancel={onClose}
        confirmLabel={t(uiLocale, 'mushaf.jumpGo')}
        onConfirm={submit}
        tone="filled"
        confirmTestID="jump-go"
      />
    </BottomSheet>
  );
}
