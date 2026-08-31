import type { ContentLanguageCode, UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
// Direct, not through the sheet barrel: header-only sheet, and the barrel's
// other exports pull the settings store into its tests. See sheet/index.ts.
import { SheetHeader } from './sheet/SheetHeader';
import { BottomSheet } from './BottomSheet';
import { LanguageSelector } from './LanguageSelector';

export interface LanguageSheetProps {
  value: ContentLanguageCode;
  uiLocale: UiLocaleCode;
  onChange: (code: ContentLanguageCode) => void;
  onClose: () => void;
}

/**
 * Translation-language picker, reached from the reader's header. It exists as a
 * sheet rather than a fixed bar because the bar cost a band of every screenful
 * for a setting most readers change once (owner ruling 2026-08-17).
 */
export function LanguageSheet({ value, uiLocale, onChange, onClose }: LanguageSheetProps) {
  return (
    <BottomSheet onClose={onClose} closeLabel={t(uiLocale, 'word.close')}>
      {/* Was accessibilityRole="header", which lands as the banner landmark
          rather than a heading. SheetHeader gets it right, and this sheet was
          the last of the five still getting it wrong. */}
      <SheetHeader title={t(uiLocale, 'reader.chooseLanguage')} />
      <LanguageSelector
        value={value}
        onChange={(code) => {
          // Guarded: a no-op write still re-renders the reader and re-runs its
          // surah query against SQLite. Closing regardless -- tapping the
          // active language is a "yes, that one" gesture, not a mistake.
          if (code !== value) onChange(code);
          onClose();
        }}
      />
    </BottomSheet>
  );
}
