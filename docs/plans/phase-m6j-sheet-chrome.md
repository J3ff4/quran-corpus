# Phase M6j — Sheet Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One sheet idiom for all five bottom sheets, so NoteEditor, ReciterSheet, WordSheet and the ⓘ trigger stop looking like a different app.

**Architecture:** Extract three primitives — `SheetHeader`, `SheetActions`, `SheetRow` — into `components/sheet/`. Every sheet composes them. `BottomSheet` keeps owning the shell (backdrop, drag, back, Modal); the new pieces own only what goes inside it.

**Tech Stack:** React Native 0.86 / Fabric, Expo 57, reanimated 4.5, vitest + @testing-library/react over `testing/rnHosts.ts`.

**Spec:** This file. Owner rulings, 2026-08-31:
- D51 — scope is four surfaces **plus** extraction, and all three already-consistent sheets retrofit onto the shared chrome.
- D52 — reciter selection is a **full-width row with a check icon**, accent text, tinted fill. Not pills (labels run to 33 chars), not glass cards.
- D53 — note editor gets a **filled accent Save** plus a text Cancel. First filled button in the app; deliberate, it is the only sheet with a destructive-to-lose draft.

## Global Constraints

- `apps/mobile` only. No `packages/data` change, no validation change, no user-DB write change ⇒ **§5 does not fire.** If a task finds itself editing any of those, stop and ask.
- Touch targets ≥ `touchTargets.minimum` (48). The 33dp text-run button is the defect this phase exists to stop repeating.
- Selection state never carried by colour alone (WCAG 1.4.1) — icon or weight as well.
- AA (4.5:1) for body text on every fill, verified against the **sheet surface** (`#fffdf8` light, dark equivalent), not the page.
- Respect reduced motion: any new press feedback goes through `usePressScaleStyle`.
- Existing testIDs (`note-input`, `note-counter`, `note-error`, `confirm-cancel`, `confirm-accept`, `info-body`, `full-analysis`, `root-link`) are contracts — seven test files assert on them. Keep them.
- Conventional Commits, one logical change per commit (§9).
- Device checks are the gate for `apps/mobile` (§10). Nothing here is complete until the checks in Task 8 are run on the APK and logged.

---

## What is actually wrong

Measured against the code, not the screenshots alone.

`BottomSheet` **already supplies** `paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, gap: 14`. So:

| sheet | body wrapper | net padding | verdict |
| --- | --- | --- | --- |
| ConfirmSheet | `padding: 16, gap: 12` | 36 | double-padded |
| NoteEditor | `padding: 16, gap: 12` | 36 | double-padded |
| InfoSheet | `padding: 20, gap: 8` | 40 | double-padded |
| ReciterSheet | none | 20 | correct |
| WordSheet | none | 20 | correct |

The two sheets the owner called out are the two that are structurally *right*; the drift is that nobody agrees. The extraction settles it: **the shell owns the padding, bodies add none.**

Rest of the inventory:
- NoteEditor Cancel/Save are `<Text onPress>` with `padding: 8` ⇒ ~33dp. Same defect §5 caught in ConfirmSheet, never propagated here.
- NoteEditor title is the bare coordinate `3:9`. BookmarkRow already ruled on this: *"Al-Baqara 2:255", not "2:255"*.
- ReciterSheet draws selection with the literal characters `●` / `○`.
- `InfoButton` draws `ⓘ` as a font glyph, beside an SVG icon set — the ✎/✐ mistake, again (BookmarksScreen:548).
- WordSheet's two actions are bare accent text runs: no affordance, no press feedback.
- Sheet headers use three different treatments across five files.
- `Icon` has **no `check`** glyph. Task 1 adds one.

---

## File Structure

**New**
- `apps/mobile/src/components/sheet/SheetHeader.tsx` — title, optional subtitle. The only heading treatment.
- `apps/mobile/src/components/sheet/SheetActions.tsx` — the trailing button row; `Cancel` + one primary, primary optionally filled or danger.
- `apps/mobile/src/components/sheet/SheetRow.tsx` — one selectable/navigable row: label, optional trailing icon, selected fill, press scale.
- `apps/mobile/src/components/sheet/index.ts` — barrel, so a sheet imports one path.
- Tests beside each.

**Modified**
- `components/icons/Icon.tsx` — add `check`.
- `components/NoteEditor.tsx`, `components/ReciterSheet.tsx`, `components/WordSheet.tsx`, `components/ConfirmSheet.tsx`, `components/InfoSheet.tsx`, `components/LanguageSheet.tsx`.
- `i18n/uiStrings.ts` — new keys.

**Untouched on purpose**
- `components/BottomSheet.tsx`. It is the shell and it works; its 203 lines carry the drag maths, the back handler and the height measurement. Task 6 is the one exception and it is additive.

---

### Task 1: A `check` glyph

**Files:**
- Modify: `apps/mobile/src/components/icons/Icon.tsx:4-35`
- Test: `apps/mobile/src/components/icons/Icon.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `IconName` gains `'check'`. `<Icon name="check" color={string} size={number} />`.

- [ ] **Step 1: Write the failing test**

```tsx
it('draws a check', () => {
  // Icon takes a testID, it does not invent one -- it spreads the prop only
  // when given (exactOptionalPropertyTypes). Every caller below passes it.
  render(<Icon name="check" color="#1f6f5b" size={20} testID="icon-check" />);
  // Every glyph in the set is one or more <path d>; a name with no entry
  // renders an empty <svg>, which is the regression this catches.
  expect(screen.getByTestId('icon-check').querySelectorAll('path').length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `cd apps/mobile && npx vitest run src/components/icons/Icon.test.tsx`
Expected: FAIL — `check` is not assignable to `IconName`, or zero paths.

- [ ] **Step 3: Add the name and the path**

In the `IconName` union add `| 'check'`. In `PATHS` add:

```ts
  // Stroked like every other glyph in this set (RN has no currentColor, so the
  // stroke arrives from the theme). 24x24 box, same as the rest.
  check: ['M20 6L9 17l-5-5'],
```

- [ ] **Step 4: Run it, confirm it passes**

Run: same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/components/icons/Icon.tsx apps/mobile/src/components/icons/Icon.test.tsx
git commit -m "feat(mobile/icons): add a check glyph"
```

---

### Task 2: `SheetHeader`

**Files:**
- Create: `apps/mobile/src/components/sheet/SheetHeader.tsx`
- Create: `apps/mobile/src/components/sheet/SheetHeader.test.tsx`

**Interfaces:**
- Consumes: `useThemeColors()`, `typography` from `@/theme/tokens`.
- Produces:
```ts
export interface SheetHeaderProps { title: string; subtitle?: string }
export function SheetHeader(props: SheetHeaderProps): JSX.Element
```

**Decision — `role="heading"`, not `accessibilityRole="header"`.** InfoSheet and EntryHeader both carry the note: `accessibilityRole="header"` lands as the banner landmark, not the heading role. The other four sheets have it wrong. Fixing it here fixes it everywhere.

- [ ] **Step 1: Write the failing test**

```tsx
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SheetHeader } from './SheetHeader';

vi.mock('@/theme/themeContext', () => ({
  useThemeColors: () => ({ text: '#111', mutedText: '#777' }),
}));

afterEach(cleanup);

describe('SheetHeader', () => {
  it('publishes the title as a heading', () => {
    render(<SheetHeader title="Choose reciter" />);
    expect(screen.getByRole('heading', { name: 'Choose reciter' })).toBeTruthy();
  });

  it('renders a subtitle under the title when one is given', () => {
    render(<SheetHeader title="Add note" subtitle="Aal-Imran 3:9" />);
    expect(screen.getByText('Aal-Imran 3:9')).toBeTruthy();
  });

  it('renders nothing extra when there is no subtitle', () => {
    const { container } = render(<SheetHeader title="Add note" />);
    // Exactly one text node: a stray empty <Text> still occupies a row in the
    // sheet's `gap: 14` column and pushes the body down.
    expect(container.querySelectorAll('span').length).toBe(1);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run src/components/sheet/SheetHeader.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import { Text, View } from 'react-native';

import { typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** The heading of a bottom sheet. The only one -- before this, five sheets
 *  carried three different treatments (700 with no size, `typography.body` at
 *  600, and a plain `role="heading"`).
 *
 *  No padding of its own. `BottomSheet` already applies 20 horizontal, 12 top
 *  and a 14 gap between children, and the bodies that added another 16 or 20
 *  were double-padding it. */
export interface SheetHeaderProps {
  title: string;
  /** Context under the title -- the ayah a note belongs to, say. Omitted, no
   *  row is drawn at all. */
  subtitle?: string;
}

export function SheetHeader({ title, subtitle }: SheetHeaderProps) {
  const theme = useThemeColors();

  return (
    <View style={{ gap: 2 }}>
      {/* role="heading" (ARIA-aligned), NOT accessibilityRole="header": the
          latter lands as the banner landmark rather than a heading. Same note
          as EntryHeader and InfoSheet. */}
      <Text role="heading" style={{ color: theme.text, fontSize: typography.body, fontWeight: '700' }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: theme.mutedText, fontSize: typography.caption }}>{subtitle}</Text>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: same command. Expected: 3 passed.

- [ ] **Step 5: Mutation-check**

Delete the `subtitle ?` guard so the `<Text>` always renders. Confirm `renders nothing extra when there is no subtitle` fails. Restore **by re-editing** — never `git checkout` (standing rule).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/sheet/SheetHeader.tsx apps/mobile/src/components/sheet/SheetHeader.test.tsx
git commit -m "feat(mobile/sheet): one heading treatment for every bottom sheet"
```

---

### Task 3: `SheetActions`

**Files:**
- Create: `apps/mobile/src/components/sheet/SheetActions.tsx`
- Create: `apps/mobile/src/components/sheet/SheetActions.test.tsx`

**Interfaces:**
- Consumes: `touchTargets`, `radii` from `@/theme/tokens`; `usePressScaleStyle` from `@/motion/usePressScale`.
- Produces:
```ts
export interface SheetActionsProps {
  cancelLabel: string;
  onCancel: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  /** 'filled' = accent background (NoteEditor's Save, D53).
   *  'danger'  = danger-coloured text (ConfirmSheet's destructive confirm).
   *  'text'    = plain accent text. */
  tone?: 'filled' | 'danger' | 'text';
  cancelTestID?: string;
  confirmTestID?: string;
}
```

**Decision — why `tone` exists with three values and that is not speculative generality.** All three have a caller on day one: NoteEditor is `filled`, ConfirmSheet is `danger`, WordSheet-adjacent future sheets get `text` (the default). A `variant` with one variant would be the abstraction §3 warns about; three real ones is a switch.

- [ ] **Step 1: Write the failing test**

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SheetActions } from './SheetActions';

vi.mock('@/theme/themeContext', () => ({
  useThemeColors: () => ({
    accent: '#1f6f5b', onAccent: '#fff', mutedText: '#777', danger: '#9f2d2d', text: '#111',
  }),
}));
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ reduceMotion: false }) }));

const base = {
  cancelLabel: 'Cancel', onCancel: () => {},
  confirmLabel: 'Save', onConfirm: () => {},
};

afterEach(cleanup);

describe('SheetActions', () => {
  it('gives both buttons the 48dp floor', () => {
    render(<SheetActions {...base} cancelTestID="c" confirmTestID="k" />);
    // The whole point of this component. A padded <Text> measured ~33dp, and
    // the button that missed was the one that discarded a note.
    for (const id of ['c', 'k']) {
      expect(screen.getByTestId(id).style.minHeight).toBe('48px');
    }
  });

  it('calls back on each button', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<SheetActions {...base} onCancel={onCancel} onConfirm={onConfirm} cancelTestID="c" confirmTestID="k" />);
    fireEvent.click(screen.getByTestId('c'));
    fireEvent.click(screen.getByTestId('k'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('fills the confirm button when the tone asks for it', () => {
    render(<SheetActions {...base} tone="filled" confirmTestID="k" />);
    expect(screen.getByTestId('k').style.backgroundColor).toBe('rgb(31, 111, 91)');
  });

  it('leaves the confirm button unfilled otherwise', () => {
    // A danger confirm is danger-coloured TEXT, never a red block: `danger` is
    // tuned to be readable type, and as a solid fill it is a pale pink slab
    // (the dangerFill note in BookmarksScreen).
    render(<SheetActions {...base} tone="danger" confirmTestID="k" />);
    expect(screen.getByTestId('k').style.backgroundColor).toBe('');
  });

  it('names both buttons for a screen reader', () => {
    render(<SheetActions {...base} />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run src/components/sheet/SheetActions.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
import { Pressable, Text, View } from 'react-native';

import { usePressScaleStyle } from '@/motion/usePressScale';
import { radii, touchTargets } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** The trailing Cancel/confirm row of a bottom sheet.
 *
 *  Pressables sized to the 48dp floor, never text runs with padding: the
 *  padded <Text> this replaces measured about 33dp, and it was the control
 *  that discarded a typed note. §5 caught it once in ConfirmSheet; NoteEditor
 *  kept the defect because the fix was made in place instead of extracted. */
export interface SheetActionsProps {
  cancelLabel: string;
  onCancel: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  tone?: 'filled' | 'danger' | 'text';
  cancelTestID?: string;
  confirmTestID?: string;
}

export function SheetActions({
  cancelLabel,
  onCancel,
  confirmLabel,
  onConfirm,
  tone = 'text',
  cancelTestID,
  confirmTestID,
}: SheetActionsProps) {
  const theme = useThemeColors();
  const pressStyle = usePressScaleStyle();

  const button = {
    minHeight: touchTargets.minimum,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.chip,
  } as const;

  const confirmColor = tone === 'danger' ? theme.danger : tone === 'filled' ? theme.onAccent : theme.accent;

  return (
    <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
      <Pressable
        testID={cancelTestID}
        accessibilityRole="button"
        accessibilityLabel={cancelLabel}
        onPress={onCancel}
        style={(state) => [button, pressStyle(state)]}
      >
        <Text style={{ color: theme.mutedText }}>{cancelLabel}</Text>
      </Pressable>
      <Pressable
        testID={confirmTestID}
        accessibilityRole="button"
        accessibilityLabel={confirmLabel}
        onPress={onConfirm}
        style={(state) => [
          button,
          // Filled only where the sheet asked for it. `danger` stays type, not
          // a block -- see the test's note.
          tone === 'filled' ? { backgroundColor: theme.accent } : null,
          pressStyle(state),
        ]}
      >
        <Text style={{ color: confirmColor, fontWeight: '700' }}>{confirmLabel}</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: same command. Expected: 5 passed.

- [ ] **Step 5: Mutation-check**

Change `minHeight: touchTargets.minimum` to `paddingVertical: 8`. Confirm the 48dp test fails. Then flip `tone === 'filled'` to `tone !== 'filled'` and confirm both fill tests fail. Restore by re-editing.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/components/sheet/SheetActions.tsx apps/mobile/src/components/sheet/SheetActions.test.tsx
git commit -m "feat(mobile/sheet): a 48dp action row for every sheet"
```

---

### Task 4: `SheetRow`

**Files:**
- Create: `apps/mobile/src/components/sheet/SheetRow.tsx`
- Create: `apps/mobile/src/components/sheet/SheetRow.test.tsx`

**Interfaces:**
- Consumes: `Icon` (needs Task 1's `check`), `usePressScaleStyle`, `touchTargets`, `radii`.
- Produces:
```ts
export interface SheetRowProps {
  label: string;
  onPress: () => void;
  /** Set for an exclusive choice; makes the row a radio and draws the check. */
  selected?: boolean;
  /** 'radio' for a picker, 'button' for a navigation action. Default 'button'. */
  role?: 'radio' | 'button';
  trailingIcon?: IconName;
  testID?: string;
}
```

**Decision — D52's row, not a pill.** Reciter labels reach 33 characters (`Mahmoud Khalil Al-Husary (Murattal)`); LanguageSelector's pills hold `O'zbek`. Same accessibility contract (radio role, `accessibilityState.selected`), different geometry.

**Risk — the tint.** `accentWash` is documented as *"the accent at 12% over the page… accent on it is 4.82:1"*. A sheet's ground is `surface` (`#fffdf8`), not `background` (`#faf8f3`). Step 5 measures it rather than assuming, per the standing rule to calibrate a token against its worst call site.

- [ ] **Step 1: Write the failing test**

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SheetRow } from './SheetRow';

vi.mock('@/theme/themeContext', () => ({
  useThemeColors: () => ({ text: '#111', accent: '#1f6f5b', accentWash: '#e0e8e1', mutedText: '#777' }),
}));
vi.mock('@/settings/settingsStore', () => ({ useAppSettings: () => ({ reduceMotion: false }) }));

afterEach(cleanup);

describe('SheetRow', () => {
  it('is a radio that reports its selection when it is a choice', () => {
    render(<SheetRow label="Abdul Basit" role="radio" selected onPress={() => {}} testID="r" />);
    const row = screen.getByTestId('r');
    // aria-selected is what tells a screen reader "6 of 10" instead of leaving
    // selection as an afterthought.
    expect(row.getAttribute('role')).toBe('radio');
    expect(row.getAttribute('aria-selected')).toBe('true');
  });

  it('marks the selected row with more than colour', () => {
    // WCAG 1.4.1: accent text alone does not carry "this one is active".
    render(<SheetRow label="Abdul Basit" role="radio" selected onPress={() => {}} testID="r" />);
    expect(screen.getByTestId('icon-check')).toBeTruthy();
  });

  it('draws no check on an unselected row', () => {
    render(<SheetRow label="As-Sudais" role="radio" onPress={() => {}} testID="r" />);
    expect(screen.queryByTestId('icon-check')).toBeNull();
  });

  it('keeps the 48dp floor', () => {
    render(<SheetRow label="As-Sudais" onPress={() => {}} testID="r" />);
    expect(screen.getByTestId('r').style.minHeight).toBe('48px');
  });

  it('names only the label, not the decoration', () => {
    render(<SheetRow label="Abdul Basit" role="radio" selected onPress={() => {}} testID="r" />);
    expect(screen.getByTestId('r').getAttribute('aria-label')).toBe('Abdul Basit');
  });

  it('calls back when tapped', () => {
    const onPress = vi.fn();
    render(<SheetRow label="As-Sudais" onPress={onPress} testID="r" />);
    fireEvent.click(screen.getByTestId('r'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npx vitest run src/components/sheet/SheetRow.test.tsx`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
import { Pressable, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icons/Icon';
import { usePressScaleStyle } from '@/motion/usePressScale';
import { radii, touchTargets, typography } from '@/theme/tokens';
import { useThemeColors } from '@/theme/themeContext';

/** One row inside a bottom sheet: a choice in a picker, or a way out of it.
 *
 *  Rows rather than pills for a picker (owner ruling D52): a reciter label runs
 *  to 33 characters, where LanguageSelector's pills hold six. Same
 *  accessibility contract as those pills -- radio role, selection state -- and
 *  a different shape. */
export interface SheetRowProps {
  label: string;
  onPress: () => void;
  selected?: boolean;
  role?: 'radio' | 'button';
  trailingIcon?: IconName;
  testID?: string;
}

export function SheetRow({
  label,
  onPress,
  selected = false,
  role = 'button',
  trailingIcon,
  testID,
}: SheetRowProps) {
  const theme = useThemeColors();
  const pressStyle = usePressScaleStyle();
  // check for the chosen one, whatever the caller asked for otherwise.
  const icon = selected ? 'check' : trailingIcon;

  return (
    <Pressable
      testID={testID}
      accessibilityRole={role}
      // checked as well as selected: TalkBack reads the two differently
      // depending on the role, and a radio with only `selected` announces
      // nothing about its state on some builds.
      accessibilityState={role === 'radio' ? { selected, checked: selected } : undefined}
      // The label alone. The check is decorative here -- the state is already
      // carried by accessibilityState, and announcing both says it twice.
      accessibilityLabel={label}
      onPress={onPress}
      style={(state) => [
        {
          minHeight: touchTargets.minimum,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingHorizontal: 12,
          borderRadius: radii.chip,
          backgroundColor: selected ? theme.accentWash : 'transparent',
        },
        pressStyle(state),
      ]}
    >
      <Text
        style={{
          color: selected ? theme.accent : theme.text,
          fontSize: typography.body,
          fontWeight: selected ? '700' : '400',
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
      {icon ? (
        <View>
          {/* testID passed explicitly: Icon spreads the prop only when given,
              so an omitted one is not queryable and the selection test above
              would pass against a row that drew nothing. */}
          <Icon
            testID={`icon-${icon}`}
            name={icon}
            color={selected ? theme.accent : theme.mutedText}
            size={20}
          />
        </View>
      ) : null}
    </Pressable>
  );
}
```

- [ ] **Step 4: Run it, confirm it passes**

Run: same command. Expected: 6 passed.

- [ ] **Step 5: Verify the tint clears AA on a sheet, not on the page**

`accentWash` was calibrated over `background`. Sheets sit on `surface`. `accentWash` is opaque, so the ground behind it does not change its value — but confirm, and confirm the dark pair too:

```bash
cd apps/mobile && npx tsx -e "
const hex = (h) => [1,3,5].map(i => parseInt(h.slice(i,i+2),16)/255);
const lin = (c) => c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4;
const L = (h) => { const [r,g,b] = hex(h).map(lin); return 0.2126*r + 0.7152*g + 0.0722*b; };
const ratio = (a,b) => { const [x,y] = [L(a),L(b)].sort((m,n) => n-m); return (x+0.05)/(y+0.05); };
console.log('light accent on accentWash', ratio('#1f6f5b','#e0e8e1').toFixed(2));
"
```

Expected ≥ 4.5. If the dark theme's pair falls short, adjust the **dark** `accentWash` in `theme/tokens.ts` and say so in the commit body. Do not lower the requirement.

- [ ] **Step 6: Mutation-check**

Remove `checked: selected` from `accessibilityState`; confirm the radio test fails. Then force `icon` to `undefined`; confirm `marks the selected row with more than colour` fails. Restore by re-editing.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/sheet/SheetRow.tsx apps/mobile/src/components/sheet/SheetRow.test.tsx
git commit -m "feat(mobile/sheet): a selectable row with a real check, not a bullet"
```

---

### Task 5: Barrel + new strings

**Files:**
- Create: `apps/mobile/src/components/sheet/index.ts`
- Modify: `apps/mobile/src/i18n/uiStrings.ts`
- Test: `apps/mobile/src/i18n/uiStrings.test.ts` (exists; it already asserts every key is present in all three locales)

**Interfaces:**
- Produces: `import { SheetHeader, SheetActions, SheetRow } from '@/components/sheet';`

- [ ] **Step 1: Write the barrel**

```ts
// One import path per sheet. Three separate ones is how a sheet ends up
// pulling two of the three and hand-rolling the third.
export { SheetHeader, type SheetHeaderProps } from './SheetHeader';
export { SheetActions, type SheetActionsProps } from './SheetActions';
export { SheetRow, type SheetRowProps } from './SheetRow';
```

- [ ] **Step 2: Add the strings**

`bookmarks.addNote` / `bookmarks.editNote` already exist and are used as accessibility labels; reuse them as the NoteEditor title. Add only what is genuinely new — the note sheet's subtitle needs the surah name, and NoteEditor is handed a coordinate today, so the **caller** must pass the name (Task 6 threads it). No new key needed for that.

Add nothing unless a task below proves it needs one. If it does, add to **all three** locales in the same edit — `uiStrings.test.ts` fails otherwise, which is the guard.

- [ ] **Step 3: Run the locale guard**

Run: `npx vitest run src/i18n/uiStrings.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/src/components/sheet/index.ts
git commit -m "chore(mobile/sheet): barrel the sheet primitives"
```

---

### Task 6: NoteEditor onto the chrome

**Files:**
- Modify: `apps/mobile/src/components/NoteEditor.tsx` (whole body)
- Modify: `apps/mobile/src/screens/BookmarksScreen.tsx` — pass `surahName`
- Modify: `apps/mobile/app/surah/[surahId].tsx` — the reader's call site, same prop. **Not** `components/SurahReader.tsx`: the reader raises `onEditNote`, the route owns `editingNote` and renders the sheet.
- Test: `apps/mobile/src/screens/BookmarksTab.test.tsx` (existing; covers `note-input`, `note-counter`)
- Test: `apps/mobile/src/screens/SurahRoute.test.tsx` (existing — the route's suite)

**Interfaces:**
- Consumes: `SheetHeader`, `SheetActions` from Task 5.
- Produces: `NoteEditorProps` gains `surahName: string | null` — the transliterated name, or null where the caller genuinely does not have it (then the title falls back to the bare coordinate).

**Changes, each with its reason:**
1. Title `Add note` / `Edit note` via the existing keys; subtitle `Aal-Imran 3:9`. The bare `3:9` identifies the ayah only to someone who knows the surah order — BookmarkRow's own ruling.
2. Cancel/Save → `SheetActions` with `tone="filled"` (D53). Kills the ~33dp text buttons.
3. Drop the `padding: 16` wrapper — `BottomSheet` already pads 20/12/28 with `gap: 14`.
4. Input gets a filled ground (`theme.background` inside a `surface` sheet) so it reads as a field, and `radii.chip` to match the row family.

- [ ] **Step 1: Write the failing tests**

Add to `BookmarksTab.test.tsx`:

```tsx
it('names the ayah in the note sheet, not just its coordinate', async () => {
  const userClient = requireUserClient();
  await setBookmark(userClient, 2, 255, true);
  render(<BookmarksTab />);
  fireEvent.click(await screen.findByTestId('bookmark-note-2-255'));
  // "2:255" alone identifies the ayah only to someone who knows the order.
  expect(await screen.findByText('Al-Baqara 2:255')).toBeTruthy();
});

it('gives the note sheet buttons the 48dp floor', async () => {
  const userClient = requireUserClient();
  await setBookmark(userClient, 2, 255, true);
  render(<BookmarksTab />);
  fireEvent.click(await screen.findByTestId('bookmark-note-2-255'));
  // The control that discards a typed note was ~33dp.
  expect(screen.getByTestId('note-save').style.minHeight).toBe('48px');
  expect(screen.getByTestId('note-cancel').style.minHeight).toBe('48px');
});
```

- [ ] **Step 2: Run them, confirm they fail**

Run: `npx vitest run src/screens/BookmarksTab.test.tsx`
Expected: FAIL — no `Al-Baqara 2:255` text, no `note-save` testID.

- [ ] **Step 3: Rewrite NoteEditor's body**

```tsx
export interface NoteEditorProps {
  surahId: number;
  ayahNumber: number;
  /** Transliterated surah name, or null where the caller has only the
   *  coordinate. Titles the sheet with "Al-Baqara 2:255" rather than "2:255". */
  surahName: string | null;
  note: string | null;
  uiLocale: UiLocaleCode;
  error?: string | null;
  onCancel: () => void;
  onSave: (note: string) => void;
}

export function NoteEditor({
  surahId, ayahNumber, surahName, note, uiLocale, error, onCancel, onSave,
}: NoteEditorProps) {
  const theme = useThemeColors();
  const [draft, setDraft] = useState(note ?? '');
  const coordinate = `${surahId}:${ayahNumber}`;

  return (
    <BottomSheet onClose={onCancel} closeLabel={t(uiLocale, 'bookmarks.cancel')}>
      {/* No padding wrapper: BottomSheet already applies 20/12/28 and a 14 gap. */}
      <SheetHeader
        title={t(uiLocale, note === null ? 'bookmarks.addNote' : 'bookmarks.editNote')}
        subtitle={surahName ? `${surahName} ${coordinate}` : coordinate}
      />
      <TextInput
        testID="note-input"
        value={draft}
        onChangeText={setDraft}
        multiline
        maxLength={NOTE_MAX_LENGTH}
        placeholder={t(uiLocale, 'bookmarks.notePlaceholder')}
        placeholderTextColor={theme.mutedText}
        accessibilityLabel={t(uiLocale, note === null ? 'bookmarks.addNote' : 'bookmarks.editNote')}
        style={{
          color: theme.text,
          // Filled, not a hairline outline on the sheet's own ground: every
          // other surface in this app is a filled shape, and an outlined box
          // was the one control that read as a stock form field.
          backgroundColor: theme.background,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: radii.chip,
          padding: 12,
          minHeight: 96,
          textAlignVertical: 'top',
        }}
      />
      <Text testID="note-counter" style={{ color: theme.mutedText, fontSize: typography.caption }}>
        {`${t(uiLocale, 'bookmarks.noteCounter')} · ${NOTE_MAX_LENGTH - draft.length}`}
      </Text>
      {error ? (
        <Text testID="note-error" accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: theme.danger }}>
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
```

- [ ] **Step 4: Thread `surahName` from both call sites**

`BookmarksScreen.tsx` already holds `surahNames: Map<number, string>`:

```tsx
<NoteEditor
  surahId={editing.surahId}
  ayahNumber={editing.ayahNumber}
  surahName={surahNames.get(editing.surahId) ?? null}
  ...
```

`app/surah/[surahId].tsx` already holds `data.surah` from `getSurahReader`, so:

```tsx
<NoteEditor
  surahId={displayedSurahId ?? 0}
  ayahNumber={editingNote}
  surahName={data?.surah.name_translit ?? null}
  ...
```

Note `displayedSurahId ?? 0` is pre-existing — leave it. A 0 there is a bug of its own, but it is out of this phase's scope and changing it silently would hide it.

- [ ] **Step 5: Run the suites**

Run: `npx vitest run src/screens/BookmarksTab.test.tsx src/screens/SurahRoute.test.tsx`
Expected: PASS, including the two new tests.

- [ ] **Step 6: Mutation-check**

Change `tone="filled"` to `tone="text"` — the 48dp test must still pass (it is about size, not fill), so instead revert `SheetActions` to a `<Text onPress>` in NoteEditor and confirm `gives the note sheet buttons the 48dp floor` fails. Then drop `surahName` from the subtitle and confirm the naming test fails. Restore by re-editing.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/components/NoteEditor.tsx apps/mobile/src/screens/BookmarksScreen.tsx 'apps/mobile/app/surah/[surahId].tsx' apps/mobile/src/screens/BookmarksTab.test.tsx apps/mobile/src/screens/SurahRoute.test.tsx
git commit -m "fix(mobile/notes): name the ayah and give the note sheet real buttons"
```

---

### Task 7: ReciterSheet, WordSheet, InfoButton

Three surfaces, one commit each. Same shape of change: delete the hand-rolled markup, compose the primitives.

**Files:**
- Modify: `apps/mobile/src/components/ReciterSheet.tsx`
- Modify: `apps/mobile/src/components/WordSheet.tsx`
- Modify: `apps/mobile/src/components/InfoSheet.tsx` (the `InfoButton` half)
- Test: `ReciterSheet.test.tsx`, `WordSheet.test.tsx`, `InfoSheet.test.tsx` (all exist)

- [ ] **Step 1: ReciterSheet — write the failing test**

```tsx
it('marks the active reciter with a check, not a text bullet', () => {
  render(<ReciterSheet current="abdulbasit-murattal" uiLocale="en" onSelect={() => {}} onClose={() => {}} />);
  // The bullets were literal ● / ○ characters in a Text run, beside an SVG
  // icon set that has had a check since M6j task 1.
  expect(screen.queryByText(/●|○/)).toBeNull();
  expect(screen.getByTestId('icon-check')).toBeTruthy();
});
```

- [ ] **Step 2: Run it, confirm it fails.** `npx vitest run src/components/ReciterSheet.test.tsx` — FAIL, the bullet is found.

- [ ] **Step 3: Replace the row markup**

```tsx
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
          // Guarded: re-selecting the active reciter re-runs the settings
          // write for a value that has not changed. Closing either way --
          // tapping it is "yes, that one", not a mistake.
          if (reciter.id !== current) onSelect(reciter.id);
          onClose();
        }}
      />
    ))}
  </View>
</ScrollView>
```

- [ ] **Step 4: Run it, confirm it passes**, and that the file's existing tests (selection, guard, close) still pass.

- [ ] **Step 5: WordSheet — write the failing test**

```tsx
it('gives the two ways deeper a row treatment, not a bare text run', () => {
  render(<WordSheet summary={summary} uiLocale="en" onClose={() => {}} onOpenDetail={() => {}} onOpenRoot={() => {}} />);
  // Most-tapped sheet in the app: every word in word-by-word opens it.
  expect(screen.getByTestId('full-analysis').style.minHeight).toBe('48px');
  expect(screen.getByTestId('root-link').style.minHeight).toBe('48px');
});
```

- [ ] **Step 6: Run it, confirm it fails, then replace both actions**

```tsx
<SheetRow
  testID="full-analysis"
  label={t(uiLocale, 'word.fullAnalysis')}
  trailingIcon="chevronRight"
  onPress={() => onOpenDetail(word)}
/>
{rootBuckwalter ? (
  <SheetRow
    testID="root-link"
    label={`${t(uiLocale, 'word.root')} ${word.root ?? rootBuckwalter}`}
    trailingIcon="chevronRight"
    onPress={() => onOpenRoot(rootBuckwalter)}
  />
) : null}
```

Keep `actionStyle` deleted, and keep the testIDs — `WordSheet.test.tsx` and `WbwScreen` assertions depend on them.

- [ ] **Step 7: InfoButton — write the failing test**

```tsx
it('draws the info affordance as an icon, not a font glyph', () => {
  render(<InfoButton label="About this list" expanded={false} onPress={() => {}} />);
  // Same defect as the ✎/✐ pair bookmarks replaced: a font glyph renders at
  // whatever weight the system face has, beside a drawn icon set.
  expect(screen.queryByText('ⓘ')).toBeNull();
  expect(screen.getByTestId('icon-info')).toBeTruthy();
});
```

- [ ] **Step 8: Run it, confirm it fails, then swap the glyph**

```tsx
<Icon testID="icon-info" name="info" color={theme.mutedText} size={20} />
```

`info` is already in `IconName` — no Task 1 dependency here.

- [ ] **Step 9: Run all three suites**

Run: `npx vitest run src/components/ReciterSheet.test.tsx src/components/WordSheet.test.tsx src/components/InfoSheet.test.tsx`
Expected: PASS.

- [ ] **Step 10: Mutation-check each**

Put the `●`/`○` bullets back → reciter test fails. Drop `minHeight` from `SheetRow` → WordSheet test fails. Put `ⓘ` back → InfoButton test fails. Restore each by re-editing.

- [ ] **Step 11: Three commits**

```bash
git commit -m "fix(mobile/reciter): a real row and a check instead of text bullets"
git commit -m "fix(mobile/word-sheet): give the two links a row treatment"
git commit -m "fix(mobile/lemma): draw the info affordance from the icon set"
```

---

### Task 8: Retrofit the three consistent sheets, then verify

**Files:**
- Modify: `apps/mobile/src/components/ConfirmSheet.tsx`, `InfoSheet.tsx`, `LanguageSheet.tsx`
- Test: existing suites + `BookmarksTab.test.tsx` (checks 163/168 paths)

D51 says retrofit all. The risk is real — ConfirmSheet passed device checks 163 and 168 after the §5 fix — so the retrofit is behaviour-preserving by construction: same testIDs, same labels, same order, same tone.

- [ ] **Step 1: ConfirmSheet**

Replace the header `<Text>` with `<SheetHeader title={title} />`, the body stays a plain `<Text>`, and the button row becomes:

```tsx
<SheetActions
  cancelLabel={t(uiLocale, 'bookmarks.cancel')}
  onCancel={onCancel}
  confirmLabel={confirmLabel}
  onConfirm={onConfirm}
  tone="danger"
  cancelTestID="confirm-cancel"
  confirmTestID="confirm-accept"
/>
```

Delete the local `BUTTON` constant and the `padding: 16` wrapper.

- [ ] **Step 2: InfoSheet and LanguageSheet**

Both: header → `SheetHeader`, drop the padding wrapper. LanguageSheet keeps `LanguageSelector` untouched — its pills are the right control for three short labels, and D52 changed the *reciter* picker only.

- [ ] **Step 3: Run the whole suite**

Run: `cd apps/mobile && npx vitest run`
Expected: **all files pass**, 813 + the new tests. Any failure here is a retrofit regression, not a flake — fix it before moving on.

- [ ] **Step 4: Gates**

```bash
cd apps/mobile && npx tsc --noEmit && npx eslint app src --ext .ts,.tsx
```
Both clean.

- [ ] **Step 5: Build and install the APK**

```bash
cd apps/mobile && pnpm prebuild:assert-db
cd android && taskset -c 0,1 nice -n 19 ./gradlew assembleRelease \
  -PreactNativeArchitectures=arm64-v8a --max-workers=2 --no-daemon
adb install -r app/build/outputs/apk/release/app-release.apk
```

`taskset` is not optional — the unconstrained build drove this machine to a load of 136 (2026-08-31).

- [x] **Step 6: Device checks — log every result in the table below**

| # | Check | Pass condition |
| --- | --- | --- |
| 169 | Note sheet from a bookmark row | Titled `Add note`/`Edit note` with `<Surah> s:a` beneath; input reads as a filled field |
| 170 | Note sheet buttons | Save is a filled accent button, Cancel is text; both ≥48dp measured from a `uiautomator` dump |
| 171 | Note sheet with the keyboard up | Save reachable without dismissing the keyboard — **if it is covered, that is a finding, file it; D53 chose the bottom-anchored button knowingly** |
| 172 | Note sheet from the reader | Same sheet, same title treatment as 169 |
| 173 | Reciter sheet | Rows with a drawn check on the active one and a tinted fill; no `●`/`○` anywhere |
| 174 | Reciter sheet at a large font scale | All ten reachable by scrolling; last row not clipped by the bottom edge |
| 175 | Reciter selection | Tapping a row switches reciter and closes; re-tapping the active one closes without a write |
| 176 | Word sheet | Both links are full rows with a chevron and press feedback |
| 177 | Lemma ⓘ | Drawn icon, not a font glyph; sheet opens |
| 178 | Delete-confirm sheet | Unchanged from check 163 — glass sheet, 48dp buttons, danger text |
| 179 | TalkBack on the reciter sheet | Each row announces as a radio with its position and state |
| 180 | Dark theme, every sheet | Accent-on-tint legible; nothing lost against the dark surface |

- [x] **Step 7: Record the run**

Append a `### Device run <date>` table to this file with build, date, result and notes per check — the format used in `phase-m6h-bookmarks-notes.md`. A milestone with "verification pending" is an unmet exit criterion (§10).

- [ ] **Step 8: Commit the retrofit and the log**

```bash
git commit -m "refactor(mobile/sheet): move the remaining sheets onto the shared chrome"
git commit -m "docs: log the M6j device run"
```

---

## Risks and rollbacks

| Risk | Signal | Rollback |
| --- | --- | --- |
| Retrofit regresses the delete-confirm path | `BookmarksTab.test.tsx` delete/confirm tests fail, or device check 178 differs from 163 | Task 8's ConfirmSheet edit is one commit — revert it, keep the rest |
| `accentWash` fails AA on the sheet surface, or in dark | Task 4 Step 5 prints < 4.5 | Adjust the dark `accentWash` in `theme/tokens.ts`; never lower the bar |
| Keyboard covers the filled Save (check 171) | Device | Follow-up issue, not a revert. D53 is an owner ruling; the fix is a keyboard-aware sheet, which is a `BottomSheet` change and out of this phase's scope |
| `ScrollView` inside `BottomSheet` fights the dismiss pan | Reciter sheet cannot be scrolled, or drags the sheet instead | `simultaneousWithExternalGesture` on the sheet's gesture — the fix the old ponytail note already named |
| A testID gets renamed and a far-away suite breaks | Full suite in Task 8 Step 3 | Testids are listed in Global Constraints; restore the name |

## Acceptance criteria

1. No `<Text onPress>` acting as a button anywhere in `components/` — `grep -rn -B3 "onPress" --include=*.tsx components | grep "<Text"` returns nothing outside tests.
2. No `●`, `○` or `ⓘ` in any non-test `.tsx`.
3. Every sheet draws its heading through `SheetHeader` where it has one (`WordSheet` deliberately has none -- it leads with the Arabic word), and its buttons through `SheetActions` where it has a button row (`ConfirmSheet` and `NoteEditor`); the two header-only sheets (`InfoSheet`, `LanguageSheet`) import `SheetHeader` from its module rather than the barrel -- see the note in `sheet/index.ts`. No sheet defines its own padding wrapper.
4. Full suite green, `tsc` clean, `eslint` clean.
5. Every new branch mutation-checked, with the killed mutant named in the commit body or this file.
6. Checks 169-180 run on the release APK and logged here with dates.

## Self-review

- **Spec coverage:** D51 → Tasks 2-8 (four surfaces + extraction + retrofit). D52 → Task 4 and Task 7 Step 3. D53 → Task 3 `tone` and Task 6.
- **Placeholders:** none — every step carries the code or the exact command.
- **Type consistency:** `SheetRowProps.trailingIcon` is `IconName`, which Task 1 widens with `check` before Task 4 consumes it. `SheetActionsProps.tone` is the same union in Tasks 3, 6, 8. `NoteEditorProps.surahName` is `string | null` at the definition and both call sites.
- **Three gaps found and closed while reviewing:**
  1. `InfoButton` uses `info`, which already exists — Task 7 Step 7 does **not** depend on Task 1.
  2. `Icon` has no default testID; it spreads the prop only when given. Every assertion on `icon-check`/`icon-info` needs the caller to pass one, so Tasks 1, 4 and 7 do.
  3. The reader's note sheet is rendered by `app/surah/[surahId].tsx`, not `components/SurahReader.tsx` — the component only raises `onEditNote`. Task 6 edits the route.

---

### Device run 2026-08-31 (release APK, OnePlus 7 Pro, Android 12) — checks 169-180

Build: local `assembleRelease` from `efceb59`, arm64-v8a, debug-signed, versionCode 1,
82.7 MB. Installed over adb-over-wifi. Driven over adb: every geometry claim below is
pixels from a `uiautomator` dump, every colour claim is a pixel histogram over the whole
node rect from `screencap` — nothing eyeballed. Density override is 640, so **1 dp = 4 px**.

**10 PASS, 1 FAIL, 1 PARTIAL** after the 173 re-run below. As first run it was 9/2/1;
173's failure turned out to be an artifact of the build, not of the code -- see
*Check 173 was a bad build* under the table. 171 was anticipated by the risk table and
does not block the retrofit.

| Check | Build | Date | Result | Notes |
| --- | --- | --- | --- | --- |
| 169 | release `efceb59` | 2026-08-31 | PASS | `Add note` over `An-Nisa 4:1`; after a save the same sheet reopens titled `Edit note` with the text preserved. Input is a bordered field with a `Write a note` placeholder and a live `Characters left · 500`. |
| 170 | release `efceb59` | 2026-08-31 | PASS | Save is a filled accent block, Cancel is bare text. Cancel `[763,2816][1061,3008]` = 298×192 px = **74.5 × 48.0 dp**; Save `[1109,2816][1360,3008]` = 251×192 px = **62.8 × 48.0 dp**. Both clear the 48dp floor on the short axis exactly. |
| 171 | release `efceb59` | 2026-08-31 | **FAIL** | The IME covers the **whole sheet body**, not just Save — title, subtitle, input and both buttons are all behind the keyboard, so the reader types blind. Typing still lands (`Characters left` ran 500 → 496 while nothing was visible). Predicted by the risk table; filed, not reverted — the fix is a keyboard-aware `BottomSheet`, out of this phase's scope. |
| 172 | release `efceb59` | 2026-08-31 | PASS | Reader path gives byte-identical node bounds to 169 — same title, same `An-Nisa 4:1` caption, same button geometry. |
| 173 | release `efceb59` | 2026-08-31 | **FAIL** | Check drawn, label accent + bold, no `●`/`○` anywhere -- but the tinted fill never painted: 0 `accentWash` pixels in either theme. **Superseded by the re-run below -- the APK was built from a poisoned bundle, not from this branch's code.** |
| 173 | release `c46697c` | 2026-09-01 | **PASS** | Re-run on an APK rebuilt from a clean tree. Full-pixel histogram of the checked row `[80,1088][1360,1280]`: dark = `#212e28` 218 821 px (the dark `accentWash`) + `#5aa58d` 19 041 px (accent label and check) + `#1d1b18` 1 848 px (the `radii.chip` corners); light = `#e0e8e1` 218 813 px + `#1f6f5b` 19 042 px + `#fffdf8` 1 848 px. The unchecked neighbour stays on the surface in both. D52 satisfied: check icon, accent bold label, tinted fill. |
| 174 | release `efceb59` | 2026-08-31 | PASS | At the device maximum `font_scale 1.35`: all ten rows laid out, last row `Muhammad Ayyoub` at `[80,2816][1360,3008]`, clear of the 3056 usable edge. Nothing clipped, no scrolling needed. The deleted `ScrollView` was correctly deleted. |
| 175 | release `efceb59` | 2026-08-31 | PASS | Tapping Abdul Basit switched Settings' summary row and closed the sheet. Reopening and re-tapping the active row closed it with the summary unchanged — the `if (id !== current)` guard holds on hardware. |
| 176 | release `efceb59` | 2026-08-31 | PASS | `Full analysis` and `Root وقي` are both full-width rows spanning `[80,…][1360,…]` at 48dp with a right chevron. No heading, by design. |
| 177 | release `efceb59` | 2026-08-31 | PASS | The lemma's `TRANSLATED AS` affordance is the drawn `info` glyph (stroked ring, stem, dot), not `ⓘ`; tapping it opens the `InfoSheet` with a `SheetHeader` title and body. Its hit rect is `[586,1180][746,1340]` = **40 × 40 dp**, under the 48dp floor — the §5 finding, confirmed on hardware. |
| 178 | release `efceb59` | 2026-08-31 | PASS | Unchanged from 163. Glass sheet, `Delete this bookmark?` heading, danger **text** (not a fill). Cancel 298×192 px, Delete 289×192 px — both **48.0 dp** tall. Cancel kept the row; Delete removed it and the note. Note: an **un-noted** bookmark deletes with no sheet at all, which is `requestDelete`'s deliberate rule (`BookmarksScreen.tsx:196`), not a regression. |
| 179 | release `efceb59` | 2026-08-31 | PARTIAL | From the accessibility tree each row is `android.widget.RadioButton` with `checked=true/false` and the reciter name as its label — role and state are right. **No collection position is exposed**: `accessibilityRole="radiogroup"` on a plain `View` sets no `CollectionInfo`, so TalkBack cannot say "3 of 10". Speech itself not exercised — same deferral as checks 143/144 (issue #34). |
| 180 | release `efceb59` | 2026-08-31 | PASS | Note, reciter, word, info and confirm sheets all captured on the dark palette: surface `#1d1b18`, body text `#f1ede4`, accent `#5aa58d`, danger `#e88b8b`. Everything legible against the surface. (The dark-theme loss noted here on 2026-08-31 was 173's missing tint; the 2026-09-01 re-run paints it.) |

#### Check 173 was a bad build, not a bad row

`SheetRow`'s tint was correct in git the whole time. The `efceb59` APK's JS bundle was
compiled **while §4's mutation-check had the `backgroundColor` line deleted** from
`SheetRow.tsx`: Gradle's `createBundleReleaseJsAndAssets` read the working tree at
18:09:15 and the line was restored moments later, so the commit, the test suite and the
source map all agreed while the shipped bytecode did not.

Proof, by re-bundling with that one line removed and comparing bytecode length -- Gradle
passes `--minify false` for the JS (it follows `android.enableMinifyInReleaseBuilds`), so
`expo export:embed --dev false --minify false` piped through `hermesc -O` reproduces its
output exactly:

| bundle | bytes |
| --- | --- |
| shipped in the `efceb59` APK | 3 688 784 |
| current source | 3 688 828 |
| current source, tint line deleted | **3 688 784** |

Confirmed on hardware from both directions: the shipped bundle repacked into a re-signed
APK still fails, and a bundle built from current source paints -- minified or not.

Two things this cost three hours, both worth keeping:

- **Never start a bundle while a mutation is applied.** Mutate, assert, restore,
  `git status --porcelain` clean, *then* build. §4 step 4 and any build command must not
  overlap.
- **`sourcesContent` in `index.android.bundle.packager.map` is not evidence of what was
  compiled.** It showed `SheetRow.tsx:59` with the tint present. It agrees with the file
  on disk when the map is written, not with the code Metro emitted. Bytecode length and
  on-device pixels are the evidence.

**Environment restored after the run:** system font scale back to 1.0, app theme back to
`System`, reciter back to Al-Husary (Murattal), and the plain An-Nisa 4:1 bookmark
re-created (checks 178 and 175 consumed all three).

After the 2026-09-01 re-run the phone carries the rebuilt `c46697c` release APK (still
versionCode 1, still debug-signed), theme back to `System`, reciter untouched.

**adb gotcha, recorded so the next run does not lose twenty minutes to it:** a bare
`adb install` landed the APK in **user 10 (Guest)**, where `pm list packages` for user 0
never shows it and `am start` answers `No activities found to run` while `dumpsys package`
happily prints the manifest. Always `adb install -r --user 0`.
