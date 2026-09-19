import { useMemo, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/icons/Icon';
import { SurahList } from '@/components/SurahList';
import type { SurahListItem } from '@/data/corpusRepository';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { matchSurahs } from '@/surah/matchSurah';
import { radii, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';
import { useStableInsets } from '@/theme/useStableInsets';

export interface SurahPickerProps {
  surahs: readonly SurahListItem[];
  uiLocale: UiLocaleCode;
  /** The caller decides what a pick means. Every caller today jumps to ayah 1
   *  (ruling R3) -- including the mushaf, which turns the id into a page. */
  onPick: (surahId: number) => void;
  onClose: () => void;
}

/**
 * Find a surah by name instead of by number.
 *
 * A full-screen modal, not a `BottomSheet`, and that is the one real decision
 * here: `BottomSheet`'s pan gesture wraps its whole children tree with no
 * `simultaneousWithExternalGesture` composition, so a scrolling list inside it
 * fights the sheet's own drag rather than cooperating with it -- the same
 * reason `ReciterSheet` has no ScrollView. Ten reciter rows fit without one;
 * 114 surahs and a keyboard do not. Composing those gestures is surgery on a
 * component every sheet in the app depends on, for a list that wants the whole
 * screen anyway.
 *
 * The rows are `SurahList`'s, unchanged: the same glyph, translit and
 * meaning·count the Surahs tab shows, so a name found here looks like the name
 * found there.
 */
export function SurahPicker({ surahs, uiLocale, onPick, onClose }: SurahPickerProps) {
  const theme = useThemeColors();
  const insets = useStableInsets();
  const [query, setQuery] = useState('');
  // 114 rows, filtered in memory. Cheap enough to run per keystroke, and a
  // debounce would make the list lag behind the field it is filtered by.
  const results = useMemo(() => matchSurahs(surahs, query), [surahs, query]);

  return (
    <Modal
      visible
      animationType="slide"
      // Android's back button. Without it the modal is a trap: there is no
      // gesture to dismiss a full-screen one.
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: insets.top }}>
        <Text
          // A heading, not decoration: a full-screen modal replaces the whole
          // view, so without one nothing says what the list is -- and TalkBack
          // lands on the filter field with no context at all.
          accessibilityRole="header"
          style={{
            color: theme.text,
            fontSize: typography.title,
            paddingHorizontal: 20,
            paddingTop: 8,
          }}
        >
          {t(uiLocale, 'surahPicker.title')}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <Pressable
            testID="surah-picker-close"
            accessibilityRole="button"
            accessibilityLabel={t(uiLocale, 'word.close')}
            onPress={onClose}
            style={{
              minHeight: touchTargets.minimum,
              minWidth: touchTargets.minimum,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="close" color={theme.text} />
          </Pressable>
          <TextInput
            testID="surah-picker-filter"
            value={query}
            onChangeText={setQuery}
            // The field IS the screen's purpose, so it takes focus with the
            // keyboard rather than making the user tap once more to type.
            autoFocus
            accessibilityLabel={t(uiLocale, 'surahPicker.filter')}
            placeholder={t(uiLocale, 'surahPicker.filter')}
            placeholderTextColor={theme.mutedText}
            style={{
              flex: 1,
              minHeight: touchTargets.minimum,
              borderRadius: radii.chip,
              borderWidth: 1,
              borderColor: theme.border,
              paddingHorizontal: 14,
              color: theme.text,
              fontSize: typography.body,
            }}
          />
        </View>
        {results.length === 0 ? (
          <Text
            testID="surah-picker-empty"
            // Announced when it appears: it replaces a list that was there a
            // keystroke ago, and silence reads as a frozen screen.
            accessibilityLiveRegion="polite"
            style={{
              color: theme.mutedText,
              fontSize: typography.body,
              paddingHorizontal: 20,
              paddingTop: 24,
            }}
          >
            {t(uiLocale, 'surahPicker.empty')}
          </Text>
        ) : (
          <SurahList
            surahs={results as SurahListItem[]}
            uiLocale={uiLocale}
            onOpenSurah={(surah) => onPick(surah.id)}
          />
        )}
      </View>
    </Modal>
  );
}
