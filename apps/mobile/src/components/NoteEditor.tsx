import { Text, TextInput } from 'react-native';
import { useState } from 'react';

import { BottomSheet } from '@/components/BottomSheet';
import { GlassSurface } from '@/components/GlassSurface';
import { SheetActions, SheetHeader } from '@/components/sheet';
import type { UiLocaleCode } from '@/i18n/languages';
import { t } from '@/i18n/uiStrings';
import { NOTE_MAX_LENGTH } from '@/data/userRepository';
import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** One line of body text, and the field's own padding.
 *
 *  The field opens at one line and grows with what is typed -- a multiline
 *  TextInput with no fixed height does that by itself on both platforms -- up
 *  to three lines, after which `maxHeight` caps it and the field scrolls its
 *  own content. It used to open at a fixed 96dp, which is three empty lines of
 *  nothing on a sheet that had no room to spare (owner ruling 2026-09-10). */
const LINE = Math.round(typography.body * 1.5);
const FIELD_PADDING = 12;
const MIN_HEIGHT = LINE + FIELD_PADDING * 2;
const MAX_HEIGHT = LINE * 3 + FIELD_PADDING * 2;

/** When the counter appears at all, and when it turns to a warning.
 *
 *  Silent for the first 80% of the limit: on an empty note "Characters left ·
 *  500" is a whole caption row that says nothing anyone needs, and it sat
 *  between the field and the buttons where the sheet is tightest. A count is
 *  information only once running out is plausible. */
const COUNTER_FROM = 100;
const COUNTER_URGENT = 20;

/** The note sheet, shared by the bookmarks list and the reader.
 *
 *  One editor, two call sites: the reader's affordance opens the same sheet
 *  rather than a second one that would drift from it (CLAUDE.md §3). It takes
 *  the coordinate and the current note rather than a Bookmark row, because the
 *  reader has the coordinate on screen and does not necessarily hold the row.
 *
 *  **The sheet's own lift over the keyboard is BottomSheet's**, not this
 *  file's. Every sheet that ever holds a field needs it, and the defect it
 *  fixes -- input, counter and both buttons stranded under the keyboard -- was
 *  a fact about where the sheet sat, not about notes.
 */
export interface NoteEditorProps {
  surahId: number;
  ayahNumber: number;
  /** Transliterated surah name, or null where the caller has only the
   *  coordinate. Titles the sheet with "Al-Baqara 2:255" rather than "2:255". */
  surahName: string | null;
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

export function NoteEditor({
  surahId,
  ayahNumber,
  surahName,
  note,
  uiLocale,
  error,
  onCancel,
  onSave,
}: NoteEditorProps) {
  const theme = useThemeColors();
  const [draft, setDraft] = useState(note ?? '');
  const coordinate = `${surahId}:${ayahNumber}`;
  const remaining = NOTE_MAX_LENGTH - draft.length;

  return (
    <BottomSheet onClose={onCancel} closeLabel={t(uiLocale, 'bookmarks.cancel')}>
      {/* No padding wrapper here: BottomSheet already applies 20/12/28 and a
          14 gap between children. */}
      <SheetHeader
        title={t(uiLocale, note === null ? 'bookmarks.addNote' : 'bookmarks.editNote')}
        subtitle={surahName ? `${surahName} ${coordinate}` : coordinate}
      />
      {/* The group IS the field's shape. The input used to paint its own filled
          box with a hairline, which was the app's only stock-looking form
          control; a glass group is what every other block in every other sheet
          is made of. */}
      <GlassSurface style={{ paddingHorizontal: FIELD_PADDING, paddingVertical: 2 }}>
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
            fontSize: typography.body,
            // No height, deliberately: a multiline field with none grows to
            // fit its content, and these two are what bound that growth.
            minHeight: MIN_HEIGHT,
            maxHeight: MAX_HEIGHT,
            paddingVertical: FIELD_PADDING,
            // Horizontal padding is the group's; adding it here too would
            // double it.
            paddingHorizontal: 0,
            textAlignVertical: 'top',
          }}
        />
        {remaining <= COUNTER_FROM ? (
          <Text
            testID="note-counter"
            // Polite, not assertive: it updates on every keystroke once it is
            // showing, and an assertive region would interrupt the reader
            // typing on every one of them.
            accessibilityLiveRegion="polite"
            style={{
              color: remaining <= COUNTER_URGENT ? theme.danger : theme.mutedText,
              fontSize: typography.caption,
              textAlign: 'right',
              paddingBottom: 6,
            }}
          >
            {`${t(uiLocale, 'bookmarks.noteCounter')} · ${remaining}`}
          </Text>
        ) : null}
      </GlassSurface>
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
      <SheetActions
        cancelLabel={t(uiLocale, 'bookmarks.cancel')}
        onCancel={onCancel}
        confirmLabel={t(uiLocale, 'bookmarks.save')}
        onConfirm={() => onSave(draft)}
        tone="filled"
        cancelTestID="note-cancel"
        confirmTestID="note-save"
      />
    </BottomSheet>
  );
}
