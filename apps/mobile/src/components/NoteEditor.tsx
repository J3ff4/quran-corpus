import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { BottomSheet } from '@/components/BottomSheet';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { NOTE_MAX_LENGTH } from '@/data/userRepository';
import { radii } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** The note sheet, shared by the bookmarks list and the reader.
 *
 *  One editor, two call sites: the reader's affordance opens the same sheet
 *  rather than a second one that would drift from it (CLAUDE.md §3). It takes
 *  the coordinate and the current note rather than a Bookmark row, because the
 *  reader has the coordinate on screen and does not necessarily hold the row.
 */
export interface NoteEditorProps {
  surahId: number;
  ayahNumber: number;
  /** The stored note, or null when there is none. Seeds the draft. */
  note: string | null;
  uiLocale: UiLocaleCode;
  /** A failed write, rendered inside the sheet. It has to live here rather than
   *  on the screen behind: BottomSheet renders into a <Modal>, which is its own
   *  native window, so an alert on the screen underneath is announced to
   *  nobody and drawn behind the sheet the user is still looking at. */
  error?: string | null;
  onCancel: () => void;
  onSave: (note: string) => void;
}

export function NoteEditor({ surahId, ayahNumber, note, uiLocale, error, onCancel, onSave }: NoteEditorProps) {
  const theme = useThemeColors();
  const [draft, setDraft] = useState(note ?? '');

  return (
    <BottomSheet onClose={onCancel} closeLabel={t(uiLocale, 'bookmarks.cancel')}>
      <View style={{ padding: 16, gap: 12 }}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontWeight: '700' }}>
          {`${surahId}:${ayahNumber}`}
        </Text>
        <TextInput
          testID="note-input"
          value={draft}
          onChangeText={setDraft}
          multiline
          // A convenience, not the validation -- normalizeNote is (§3, §5). It
          // stops the counter going negative; it does not decide what is stored.
          maxLength={NOTE_MAX_LENGTH}
          placeholder={t(uiLocale, 'bookmarks.notePlaceholder')}
          placeholderTextColor={theme.mutedText}
          accessibilityLabel={t(uiLocale, note === null ? 'bookmarks.addNote' : 'bookmarks.editNote')}
          style={{
            color: theme.text,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: radii.card,
            padding: 12,
            minHeight: 96,
            textAlignVertical: 'top',
          }}
        />
        {/* Counted down, not up: silently truncating at the boundary is the
            version where a long note loses its end with nothing on screen
            having said so. */}
        <Text testID="note-counter" style={{ color: theme.mutedText }}>
          {`${t(uiLocale, 'bookmarks.noteCounter')} · ${NOTE_MAX_LENGTH - draft.length}`}
        </Text>
        {error ? (
          <Text
            testID="note-error"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ color: theme.danger }}
          >
            {error}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'flex-end' }}>
          <Text
            accessibilityRole="button"
            accessibilityLabel={t(uiLocale, 'bookmarks.cancel')}
            onPress={onCancel}
            style={{ color: theme.mutedText, padding: 8 }}
          >
            {t(uiLocale, 'bookmarks.cancel')}
          </Text>
          <Text
            accessibilityRole="button"
            accessibilityLabel={t(uiLocale, 'bookmarks.save')}
            onPress={() => onSave(draft)}
            style={{ color: theme.accent, fontWeight: '700', padding: 8 }}
          >
            {t(uiLocale, 'bookmarks.save')}
          </Text>
        </View>
      </View>
    </BottomSheet>
  );
}
