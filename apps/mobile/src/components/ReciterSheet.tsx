import { View } from 'react-native';
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
 *
 * ponytail: no ScrollView. `BottomSheet`'s pan gesture wraps its whole
 * `children` tree (no `simultaneousWithExternalGesture` composition), so a
 * ScrollView here would fight the sheet's own drag rather than cooperate with
 * it -- ten rows at 48dp is already taller than a naive maxHeight would need
 * to be, so this was speculative for a large-font-scale case nobody has
 * observed, and device check 174 exists to catch it if it turns out real.
 * Composing the gestures correctly needs a ref threaded into `BottomSheet`'s
 * pan, which is surgery worth doing once that check shows it is needed.
 */
export function ReciterSheet({ current, uiLocale, onSelect, onClose }: ReciterSheetProps) {
  return (
    <BottomSheet onClose={onClose} closeLabel={t(uiLocale, 'word.close')}>
      <SheetHeader title={t(uiLocale, 'reader.chooseReciter')} />
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
    </BottomSheet>
  );
}
