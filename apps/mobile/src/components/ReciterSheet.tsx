import { ScrollView, View } from 'react-native';
import { RECITERS } from '@quran-corpus/data/mobile';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { BottomSheet } from './BottomSheet';
import { SheetHeader, SheetRow } from './sheet';

export interface ReciterSheetProps {
  /** The active `Reciter.id`. */
  current: string;
  uiLocale: UiLocaleCode;
  onSelect: (id: string) => void;
  onClose: () => void;
}

/**
 * Reciter picker, reached from the recitation bar's reciter label and from
 * Settings.
 *
 * The list is `RECITERS` itself -- the same table `ayahAudioUrl` validates
 * against -- so the sheet cannot offer an id the URL builder would reject, and
 * there is no second list in `apps/mobile` to drift from it (CLAUDE.md §2).
 */
export function ReciterSheet({ current, uiLocale, onSelect, onClose }: ReciterSheetProps) {
  return (
    <BottomSheet onClose={onClose} closeLabel={t(uiLocale, 'word.close')}>
      <SheetHeader title={t(uiLocale, 'reader.chooseReciter')} />
      <ScrollView
        // Ten rows at 48dp plus the header overflow a short phone at a large OS
        // font scale -- the case the old file deferred in a ponytail note. The
        // sheet's own pan is a separate gesture on the handle area, so this does
        // not fight it.
        style={{ maxHeight: 420 }}
      >
        <View accessibilityRole="radiogroup">
          {RECITERS.map((reciter) => (
            <SheetRow
              key={reciter.id}
              testID={`reciter-${reciter.id}`}
              label={reciter.label}
              role="radio"
              selected={reciter.id === current}
              onPress={() => {
                // Guarded: re-selecting the active reciter re-runs the
                // settings write for a value that has not changed. Closing
                // either way -- tapping it is "yes, that one", not a mistake.
                if (reciter.id !== current) onSelect(reciter.id);
                onClose();
              }}
            />
          ))}
        </View>
      </ScrollView>
    </BottomSheet>
  );
}
