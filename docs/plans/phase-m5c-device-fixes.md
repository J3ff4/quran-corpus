# M5c Device-Run Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four defects the owner found on the 2026-08-23 device run of the `7d5f7b3` preview APK: no bottom inset on scrolling screens, a deep-linked ayah landing on the wrong ayah after visible flash-scrolling, a dim/flash on every form-chip tap, and a back stack that grows one screen per Previous/Next.

**Architecture:** Four independent single-file-ish changes plus a docs task. No schema change, no new dependency, no data regeneration. The reader fix replaces an *estimate-and-retry* landing with *render-the-target-then-scroll*, hidden behind a spinner until it lands; it also stops writing reading positions the reader never saw. The chip fix removes the dim added in M5b Task 16 while keeping that task's frozen scroll. Paging switches `router.push` to `router.replace`.

**Tech Stack:** Expo SDK 57 / expo-router 57 / React Native 0.86, `react-native-safe-area-context` ~5.7 (already a dependency, currently unused), Vitest + Testing Library over the `@/testing/rnHosts` DOM shim.

**Spec:** the owner's device report of 2026-08-23 (defects 7-10) plus the four answers given in the same session:

| # | Defect | Owner's chosen fix |
| --- | --- | --- |
| 7 | No space under the last row; content sits on the gesture bar | Every scrolling screen, safe-area aware |
| 8 | Concordance tap flash-scrolls to the wrong ayah (16:90 -> 16:49) | Render up to the target, then no motion |
| 9 | Form-chip tap dims the rows and shifts the layout | Drop the dim, keep the freeze |
| 10 | Previous/Next stacks a screen each, back walks every root | Prev/Next replaces, does not push |

## Global Constraints

- CLAUDE.md governs. §4's loop per task, including the mutation-check.
- **§5:** Task 2 changes when `recordReadingPosition` fires, which is a write to the on-device user DB. That triggers an independent read. `/code-review` is user-triggered; stop and ask after Task 5.
- No new dependency (§12). `react-native-safe-area-context` is already in `apps/mobile/package.json:44`.
- No `packages/data` change in any task.
- Gates: `pnpm -r lint`, `pnpm -r type-check`, `pnpm --filter @quran-corpus/mobile test`.
- Conventional Commits, one logical change per commit (§9).
- Branch: continue on `feat/m5-dictionary-parity`. The M5 device run has not happened yet, so all of this smokes on one new APK together with checks 34-43.

---

### Task 1: One bottom inset for every scrolling screen

**Files:**
- Create: `apps/mobile/src/theme/useListBottomPadding.ts`
- Modify: `apps/mobile/src/test/setup.ts`
- Modify: `apps/mobile/src/components/ConcordanceList.tsx` (no `contentContainerStyle` today)
- Modify: `apps/mobile/src/components/SurahReader.tsx:432`
- Modify: `apps/mobile/src/components/SurahList.tsx:51`
- Modify: `apps/mobile/src/components/FrequencyList.tsx` (no `contentContainerStyle` today)
- Modify: `apps/mobile/src/screens/WbwScreen.tsx:181`
- Modify: `apps/mobile/src/screens/SearchScreen.tsx:137`
- Modify: `apps/mobile/src/screens/DictionaryScreen.tsx` (browse list)
- Modify: `apps/mobile/src/screens/MenuScreen.tsx`
- Modify: `apps/mobile/app/about.tsx:20`
- Modify: `apps/mobile/app/word/[surah]/[ayah]/[position].tsx:87`

**Interfaces:**
- Produces: `useListBottomPadding(): number` from `@/theme/useListBottomPadding`. Every scrolling container's `contentContainerStyle.paddingBottom`.

**No unit test.** This is a style constant behind a two-line hook: there is no branch, loop, parser or validator, so §4's mutation-check does not apply and a test asserting the number would only restate it. `contentContainerStyle` is destructured out by `@/testing/rnHosts` (it has no DOM equivalent), so it is not observable through the shim in any case. Device check 44 is the gate.

- [ ] **Step 1: Write the hook**

```ts
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Breathing room under the last row of a scrolling screen, plus whatever the
 *  device reserves for its gesture bar.
 *
 *  Every list in the app was flush against the bottom edge before this (owner
 *  device run, 2026-08-23): the last concordance row sat under the gesture
 *  bar with nothing between them. `react-native-safe-area-context` was already
 *  a dependency and had no call site anywhere in the app.
 *
 *  Used unconditionally, including on the tab screens, where the tab bar may
 *  already cover the gesture area: over-padding the end of a scroll is
 *  invisible, under-padding it is the defect this fixes, and one rule beats a
 *  per-screen judgement about which navigator is hosting a shared component
 *  (WbwScreen renders under both). */
export function useListBottomPadding(): number {
  return useSafeAreaInsets().bottom + 24;
}
```

- [ ] **Step 2: Give the suites a safe-area value**

`useSafeAreaInsets` throws without a `SafeAreaProvider`; expo-router mounts one on the device (`expo-router/build/ExpoRoot.js:79`) but no test renders through it. Mock it once, globally, beside the `react-native-svg` mock, rather than in each of the ten suites this reaches. Append to `apps/mobile/src/test/setup.ts`:

```ts
// useSafeAreaInsets throws outside a SafeAreaProvider, and no suite renders
// through one -- expo-router mounts the provider on the device. Declared here
// rather than per file for the same reason react-native-svg is: ten suites
// reach it, and the eleventh would fail on a value rather than on anything
// naming the cause.
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children?: unknown }) => children,
}));
```

- [ ] **Step 3: Apply it at every scrolling container**

Every site follows the same shape: `const paddingBottom = useListBottomPadding();` beside the component's other hooks, then spent in `contentContainerStyle`. Never call the hook inside a JSX prop.

`ConcordanceList.tsx` — the FlatList has no `contentContainerStyle` at all; add one beside `style`:

```tsx
      contentContainerStyle={{ paddingBottom }}
```

`SurahReader.tsx:432`, `WbwScreen.tsx:181`, `SurahList.tsx:51` — each currently passes `{ paddingBottom: 24 }`. Replace the literal with the variable:

```tsx
        contentContainerStyle={{ paddingBottom }}
```

`SearchScreen.tsx:137` — keep the horizontal padding, replace the 32:

```tsx
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom }}
```

`DictionaryScreen.tsx` (the browse FlatList), `FrequencyList.tsx`, `MenuScreen.tsx` — none has a `contentContainerStyle`; add `contentContainerStyle={{ paddingBottom }}`.

`about.tsx:20` and `app/word/[surah]/[ayah]/[position].tsx:87` — both pass `padding: 20`, which sets all four sides. Keep it and override the bottom after it, so the key order matters:

```tsx
      contentContainerStyle={{ padding: 20, gap: 16, paddingBottom }}
```

- [ ] **Step 4: Gates**

```bash
cd apps/mobile && pnpm lint && pnpm type-check && pnpm test
```

Expected: all green, no suite touched. If a suite fails on `useSafeAreaInsets`, Step 2's mock is missing or misspelled.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/theme/useListBottomPadding.ts apps/mobile/src/test/setup.ts apps/mobile/src apps/mobile/app
git commit -m "fix(mobile): keep scrolling content off the gesture bar"
```

---

### Task 2: Land a deep-linked ayah exactly, with nothing on screen until it does

**Files:**
- Modify: `apps/mobile/src/components/SurahReader.tsx:57-62` (the constants), `:99-101` (refs), `:255-290` (the landing), `:334-341` (viewability), `:380-433` (the render)
- Test: `apps/mobile/src/components/SurahReader.test.tsx:113-168` (the mock), `:222-247` (replaces the estimate test)

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: no exported change. `SurahReaderProps` is untouched.

**Why the current code is wrong.** Ayah cards are variable height, so there is no `getItemLayout`, so `scrollToIndex` fails for any row FlatList has not measured. `onScrollToIndexFailed` currently jumps to `averageItemLength * index` — an average taken over the short cards near the top, so it lands short — then retries from there, five times, and keeps whatever the fifth try reached. On the owner's device 16:90:6 landed on 16:49 and 21:73:11 behaved the same; anything under ~ayah 50 works only because the row is already inside the default `initialNumToRender` of 10 plus a screenful. Every one of those jumps also fires `onViewableItemsChanged`, which calls `onReadingAyah` -> `recordReadingPosition`, so the saved reading position has been getting ayahs the reader never saw.

**The fix, both halves.** Render far enough down that the target row exists on the first commit (so the scroll can succeed rather than be estimated), and keep the list invisible until it lands (so no attempt is ever seen as motion, and the reading position is not written from a position nobody is at).

- [ ] **Step 1: Extend the test's FlatList mock to see the new props**

In `SurahReader.test.tsx`, the mock at line 123 destructures a fixed prop list. Add `initialNumToRender` and `ActivityIndicator`, and surface the prop:

```tsx
    FlatList: ({ data, ListHeaderComponent, renderItem, onViewableItemsChanged, onScrollToIndexFailed, onScroll, importantForAccessibility, initialNumToRender, ref }: {
      data: unknown[];
      ListHeaderComponent?: React.ReactNode;
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      onViewableItemsChanged?: (info: { viewableItems: Array<{ item: unknown }> }) => void;
      onScrollToIndexFailed?: (info: { index: number; averageItemLength: number }) => void;
      onScroll?: (event: { nativeEvent: { contentOffset: { y: number } } }) => void;
      importantForAccessibility?: string;
      initialNumToRender?: number;
      ref?: React.Ref<unknown>;
    }) => {
```

and inside the returned element's props object add:

```tsx
        { 'data-important-for-accessibility': importantForAccessibility,
          'data-initial-num-to-render': String(initialNumToRender) },
```

Add to the same mock's return object, beside `Pressable`:

```tsx
    ActivityIndicator: () => React.createElement('span', null, 'loading'),
```

- [ ] **Step 2: Write the failing tests**

Replace the whole `it('recovers from an unmeasured row by estimating the offset, then gives up', ...)` block (line 222) with these five. Delete the old one — the behaviour it asserts is the defect.

```tsx
  it('renders far enough down the list for the deep-linked ayah to exist', () => {
    // Not a performance knob here: FlatList cannot scroll to a row it has
    // never rendered, and there is no getItemLayout to tell it where one
    // would be. Rendering the target is what makes the landing exact rather
    // than an estimate off the short cards near the top.
    render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);

    expect(screen.getByTestId('reader-list').getAttribute('data-initial-num-to-render')).toBe('255');
  });

  it('opens a surah with no deep link on the default window', () => {
    // Mounting 286 cards is worth it to land on 2:255; paying it to open at
    // 2:1 is not.
    render(<SurahReader {...baseProps(readerData(300))} />);

    expect(screen.getByTestId('reader-list').getAttribute('data-initial-num-to-render')).toBe('10');
  });

  it('retries the scroll without moving the list when the row is not measured yet', async () => {
    vi.useFakeTimers();
    try {
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);
      mocks.scrollToIndex.mockClear();

      act(() => {
        mocks.onScrollToIndexFailed?.({ index: 254, averageItemLength: 120 });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });

      expect(mocks.scrollToIndex).toHaveBeenCalledWith({ index: 254, animated: false });
      // The estimate is what landed the reader on the wrong ayah, and every
      // jump it made fired a reading-position write.
      expect(mocks.scrollToOffset).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the reader hidden until the deep-link scroll lands', async () => {
    vi.useFakeTimers();
    try {
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);
      expect(screen.queryByTestId('reader-positioning')).not.toBeNull();

      // No failure reported means the scroll landed.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });

      expect(screen.queryByTestId('reader-positioning')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the reader anyway once the retries are spent', async () => {
    vi.useFakeTimers();
    try {
      render(<SurahReader {...baseProps(readerData(300))} initialAyahNumber={255} />);

      // A row that never measures must settle: leaving the reader behind a
      // spinner for as long as the screen is open is worse than showing it in
      // the wrong place.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        act(() => {
          mocks.onScrollToIndexFailed?.({ index: 254, averageItemLength: 120 });
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(150);
        });
      }

      expect(screen.queryByTestId('reader-positioning')).toBeNull();
      expect(mocks.scrollToIndex).toHaveBeenCalledTimes(12);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not record a reading position before the deep-link scroll lands', async () => {
    // The rows visible mid-landing are wherever the list happens to be, not
    // where the reader is. Recording them overwrites the saved position with
    // an ayah nobody read -- and that row is on the user's device, so a bad
    // write is not fixed by shipping a new build.
    vi.useFakeTimers();
    try {
      const onReadingAyah = vi.fn();
      const data = readerData(300);
      render(
        <SurahReader {...baseProps(data)} initialAyahNumber={255} onReadingAyah={onReadingAyah} />,
      );

      act(() => {
        mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[0] }] });
      });
      expect(onReadingAyah).not.toHaveBeenCalled();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(150);
      });
      act(() => {
        mocks.onViewableItemsChanged?.({ viewableItems: [{ item: data.ayahs[254] }] });
      });

      expect(onReadingAyah).toHaveBeenCalledWith(255);
    } finally {
      vi.useRealTimers();
    }
  });
```

The mock's outer element needs the testID the first two read. In the mock's `React.createElement('div', {...})` props object add `'data-testid': 'reader-list'`.

- [ ] **Step 3: Run them and watch them fail**

```bash
cd apps/mobile && pnpm vitest run src/components/SurahReader.test.tsx
```

Expected: the two `initial-num-to-render` tests fail on `null`, the retry test fails because `scrollToOffset` *was* called, both `reader-positioning` tests fail on a missing element, and the reading-position test fails because `onReadingAyah` was called with ayah 1.

- [ ] **Step 4: Replace the constants**

`SurahReader.tsx:56-62`, the whole `MAX_SCROLL_RETRIES` block:

```tsx
// Ayah cards are variable height (Arabic runs wrap differently per ayah), so
// there is no getItemLayout to give FlatList and scrollToIndex fails for any
// row it has not measured yet. Two halves make a deep-link landing exact
// instead of approximate: initialNumToRender is widened to cover the target,
// so the row is rendered and therefore measurable on the first commit; and the
// list stays hidden until the scroll lands, so no attempt is ever seen as
// motion.
//
// The recovery this replaces jumped to averageItemLength * index -- an average
// taken over the short cards near the top, so it landed short, retried from
// there and kept wherever the fifth try left it. On the owner's device
// (2026-08-23) 16:90 landed on 16:49, and every jump on the way fired
// onViewableItemsChanged, writing an ayah the reader never saw into the saved
// reading position.
const MAX_SCROLL_ATTEMPTS = 12;
const SCROLL_RETRY_DELAY_MS = 100;
// React Native's own default. Restated because the deep-link case overrides it
// and a bare 10 in the JSX reads as a number someone chose.
const DEFAULT_INITIAL_RENDER = 10;
```

- [ ] **Step 5: Replace the refs and the landing effect**

At `SurahReader.tsx:99-101`, `retriesRef` becomes two refs plus the settled flag:

```tsx
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  // Set by onScrollToIndexFailed, read by the attempt loop below. A ref, not
  // state: FlatList reports the failure synchronously during a scroll and a
  // re-render per attempt would remount nothing useful.
  const failedRef = useRef(false);
  // The same value as `positioned` below. onViewableItemsChanged is called by
  // FlatList from outside the React tree off a ref that never re-reads props,
  // so it cannot see the state.
  const positionedRef = useRef(false);
  const [positioned, setPositioned] = useState(false);
```

Then replace the mount effect at `:262-266` and the `onScrollToIndexFailed` callback at `:274-286` with:

```tsx
  useEffect(() => {
    // -1 means the ayah is not in this surah; 0 means the list already opens
    // on it. Neither is a landing, and both must reveal the reader at once.
    if (initialIndex <= 0) {
      positionedRef.current = true;
      setPositioned(true);
      return;
    }

    let cancelled = false;
    attemptsRef.current = 0;

    const reveal = () => {
      if (cancelled) return;
      positionedRef.current = true;
      setPositioned(true);
    };

    const attempt = () => {
      if (cancelled) return;
      failedRef.current = false;
      attemptsRef.current += 1;
      listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      retryTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        // No failure reported in that window means the scroll landed.
        if (!failedRef.current) return reveal();
        // Capped: a row that never measures has to settle. Showing the reader
        // in the wrong place is bad; leaving it behind a spinner for as long
        // as the screen is open is worse.
        if (attemptsRef.current >= MAX_SCROLL_ATTEMPTS) return reveal();
        attempt();
      }, SCROLL_RETRY_DELAY_MS);
    };

    attempt();
    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [initialIndex]);

  // Records the miss and nothing else -- see the note above MAX_SCROLL_ATTEMPTS
  // for what the offset estimate that used to live here cost.
  const onScrollToIndexFailed = useCallback(() => {
    failedRef.current = true;
  }, []);
```

Delete the now-duplicated unmount cleanup effect at `:268-272`; the landing effect's own return clears the timer.

- [ ] **Step 6: Gate the reading-position write**

`SurahReader.tsx:334`, inside the `onViewableItemsChanged` ref:

```tsx
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const firstVisibleAyah = viewableItems[0]?.item as ReaderAyah | undefined;
    // Not until the deep-link scroll has landed: the rows visible mid-landing
    // are wherever the list happens to be, and recording one overwrites the
    // saved reading position with an ayah nobody read.
    if (positionedRef.current && firstVisibleAyah) {
      onReadingAyahRef.current?.(firstVisibleAyah.ayah.ayah_number);
    }
    for (const token of viewableItems) {
      const item = token.item as ReaderAyah | undefined;
      // Prefetching is not gated: it is a read, it is idempotent, and the rows
      // around the target are exactly the ones about to be needed.
      if (item) void fetchWordsRef.current(item.ayah.id);
    }
  });
```

- [ ] **Step 7: Widen the initial window and hide the list until it lands**

At the FlatList (`:381`), add:

```tsx
        initialNumToRender={initialIndex > 0 ? initialIndex + 1 : DEFAULT_INITIAL_RENDER}
```

and change its style to:

```tsx
        style={{ flex: 1, backgroundColor: theme.background, opacity: positioned ? 1 : 0 }}
```

Immediately after the `</FlatList>` self-closing tag, inside the wrapping `<View style={{ flex: 1 }}>`:

```tsx
      {/* Over the list rather than instead of it: the list has to be mounted
          and laid out for the scroll to have anything to land on. Opacity, not
          a conditional render, for the same reason. */}
      {positioned ? null : (
        <View
          testID="reader-positioning"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.background,
          }}
        >
          <ActivityIndicator />
        </View>
      )}
```

Add `ActivityIndicator` to the `react-native` import at the top of the file.

- [ ] **Step 8: Run the tests**

```bash
cd apps/mobile && pnpm vitest run src/components/SurahReader.test.tsx
```

Expected: PASS, including the suite's existing `does not scroll for an ayah it is already showing` test at line 215.

- [ ] **Step 9: Mutation-check (§4 step 4)**

Each mutation runs alone and must produce a real assertion failure on the expected values. A `TypeError` or a module-resolution error is a FALSE KILL — redo it differently. Restore **by re-editing**, never `git checkout` / `git restore`. Record each failure verbatim in the verification log.

1. Drop `positionedRef.current &&` from Step 6's condition. Expect FAIL on `does not record a reading position before the deep-link scroll lands`, on `onReadingAyah` having been called.
2. `initialNumToRender={DEFAULT_INITIAL_RENDER}` unconditionally. Expect FAIL on `renders far enough down the list for the deep-linked ayah to exist`, `'10'` received where `'255'` was expected.
3. Delete the `attemptsRef.current >= MAX_SCROLL_ATTEMPTS` branch. Expect FAIL on `shows the reader anyway once the retries are spent` — the overlay never clears and `scrollToIndex` is called 20 times, not 12.
4. `if (!failedRef.current) return reveal();` -> `return;`. Expect FAIL on `keeps the reader hidden until the deep-link scroll lands` — the overlay never clears on a clean landing.

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/src/components/SurahReader.tsx apps/mobile/src/components/SurahReader.test.tsx
git commit -m "fix(mobile): land a deep-linked ayah exactly instead of estimating it"
```

---

### Task 3: Drop the chip dim, keep the frozen scroll

**Files:**
- Modify: `apps/mobile/src/components/ConcordanceList.tsx:256-258` (the state), `:317-334` (the reset effect), `:336-345` (renderItem), `:379-381` (the footer)
- Test: `apps/mobile/src/components/ConcordanceList.test.tsx`

**Interfaces:**
- Consumes: nothing. `ConcordanceListProps` is unchanged.
- Produces: no API change.

**What stays.** M5b Task 16's freeze — `replaceRef`, the held rows, and the three outcomes that clear them (page, empty result, failed first page) — is untouched. The test `holds the previous rows on screen until the new list has its first page` (line 237) must pass unmodified. Only the *dim* goes, and the footer spinner stops appearing during a replace, which is the layout shift the owner saw as a pixel flash. The existing `stale` state is not deleted; it is renamed to `replacing` and re-spent on the footer, so no state is added.

- [ ] **Step 1: Write the failing tests**

Add both after `holds the previous rows on screen until the new list has its first page`:

```tsx
  it('holds the previous rows at full opacity, not dimmed', async () => {
    // The dim was this phase's own idea and the owner rejected it on sight:
    // on a one-row root the whole list blinks for a filter that cannot change
    // the result. The freeze it came with stays -- only the dim goes.
    const second = deferred<ConcordanceEntry[]>();
    const { rerender } = render(
      <ConcordanceList total={1} loadPage={page([entry()])} header={<span />} />,
    );
    await waitFor(() => expect(screen.getAllByTestId('concordance-row')).toHaveLength(1));

    rerender(
      <ConcordanceList total={1} loadPage={() => second.promise} header={<span />} />,
    );

    expect(screen.getAllByTestId('concordance-row')).toHaveLength(1);
    // Nothing in this list sets opacity for any other reason.
    expect(document.querySelector('[style*="opacity"]')).toBeNull();
  });

  it('shows no footer spinner over rows it is holding', async () => {
    // The spinner appears below the last row, so on a short list it pushes the
    // content and reads as a jump. Rows that are already on screen are not
    // waiting on anything the reader can see.
    const second = deferred<ConcordanceEntry[]>();
    const { rerender } = render(
      <ConcordanceList total={1} loadPage={page([entry()])} header={<span />} />,
    );
    await waitFor(() => expect(screen.getAllByTestId('concordance-row')).toHaveLength(1));

    rerender(
      <ConcordanceList total={1} loadPage={() => second.promise} header={<span />} />,
    );

    expect(screen.queryByText('loading')).toBeNull();
  });
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd apps/mobile && pnpm vitest run src/components/ConcordanceList.test.tsx
```

Expected: the first fails on a non-null element carrying `opacity: 0.45`, the second on finding the `loading` span.

- [ ] **Step 3: Rename the state and re-spend it**

`ConcordanceList.tsx:256-258`:

```tsx
  // State, not a ref: the footer spinner is suppressed while rows are being
  // replaced, so this has to drive a render.
  const [replacing, setReplacing] = useState(false);
```

Replace every `setStale(` with `setReplacing(` in the reset effect and in `loadMore` (four call sites: lines 274, 290, 321, 329). Update the comment at `:324-327` — it currently explains the dim:

```tsx
      // NOT setEntries([]): emptying the list collapses its content height and
      // Android clamps the scroll to 0, throwing the reader to the top of the
      // screen on every form-chip tap. The previous rows stay, unchanged, until
      // the new first page replaces them.
```

- [ ] **Step 4: Drop the dim wrapper**

`ConcordanceList.tsx:336-345` becomes:

```tsx
  const renderItem = useCallback(
    ({ item }: { item: ConcordanceEntry }) => (
      <ConcordanceRow item={item} forms={forms} uiLocale={uiLocale} />
    ),
    [forms, uiLocale],
  );
```

- [ ] **Step 5: Suppress the footer spinner during a replace**

`ConcordanceList.tsx:379-381`:

```tsx
      ListFooterComponent={
        // Not while replacing: the rows above are already on screen, and a
        // spinner appearing under them shifts the content for no information.
        loading && !replacing ? <ActivityIndicator /> : failed && entries.length > 0 ? status : null
      }
```

- [ ] **Step 6: Run the tests**

```bash
cd apps/mobile && pnpm vitest run src/components/ConcordanceList.test.tsx
```

Expected: PASS, all 31, including `holds the previous rows on screen until the new list has its first page` and `does not flash the empty state before the first page arrives` unmodified.

- [ ] **Step 7: Mutation-check**

1. Put the wrapper back: `<View style={{ opacity: replacing ? 0.45 : 1 }}>`. Expect FAIL on `holds the previous rows at full opacity, not dimmed`.
2. `loading && !replacing` -> `loading`. Expect FAIL on `shows no footer spinner over rows it is holding`.
3. Delete `setReplacing(true)` from the reset effect's `else` branch. Expect FAIL on `shows no footer spinner over rows it is holding` — this is the check that the renamed state is still wired, not just declared.

Restore by re-editing each time.

- [ ] **Step 8: Commit**

```bash
git add apps/mobile/src/components/ConcordanceList.tsx apps/mobile/src/components/ConcordanceList.test.tsx
git commit -m "fix(mobile): stop dimming held concordance rows on a chip tap"
```

---

### Task 4: Previous/Next replaces the screen instead of stacking one

**Files:**
- Modify: `apps/mobile/app/root/[buckwalter].tsx:280`
- Modify: `apps/mobile/src/screens/LemmaScreen.tsx:216`
- Test: `apps/mobile/src/screens/RootRoute.test.tsx:16,24,110,190-206`, `apps/mobile/src/screens/LemmaScreen.test.tsx:11,78,115,396`

`src/screens/RootRoute.test.tsx` is the suite that covers Previous/Next, not `src/test/routes/root.test.tsx` — the latter's own comment (line 30) says so and stubs `getAdjacentRoots` to `{ prev: null, next: null }`. Do not add a navigation test there.

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. `AdjacentNav`'s `onNavigate` contract is unchanged — only what the two callers do inside it changes.

**Why.** Each Next is currently a `router.push`, so a reader who pages five roots has six screens on the stack and no way out but six back presses. Root and lemma screens live outside the tab group, so there is no tab bar and the header carries only a back arrow. Replacing keeps the stack at depth 2: back always returns to whatever opened the first root. Previous/Next still walk the ordering in both directions — they are derived from the corpus ordering, not from history — so README check 36 (Next twice, Previous twice, land back on قول) is unaffected.

- [ ] **Step 1: Write the failing tests**

In `src/screens/RootRoute.test.tsx`, add `replace` beside `push` in the hoisted mocks (line 16) and in the router mock (line 24):

```tsx
  push: vi.fn(),
  replace: vi.fn(),
```

```tsx
  router: { push: mocks.push, replace: mocks.replace },
```

Reset it in `beforeEach` beside `mocks.push.mockReset()` (line 110):

```tsx
    mocks.replace.mockReset();
```

Then change the two existing assertions. Line 194, inside `links Previous and Next to the hijāʾī neighbours`, and line 205, inside `disables the arrow at the end of the list rather than hiding it`:

```tsx
    fireEvent.click(await screen.findByTestId('root-next'));
    // replace, not push: five taps of Next used to leave six screens on the
    // stack, and root screens are outside the tab group -- back was the only
    // way out, six times over.
    expect(mocks.replace).toHaveBeenCalledWith('/root/qwm');
    expect(mocks.push).not.toHaveBeenCalled();
```

```tsx
    const next = await screen.findByTestId('root-next');
    fireEvent.click(next);
    expect(mocks.replace).not.toHaveBeenCalled();
```

(Keep each test's existing surrounding lines; only the assertion target changes, plus the `push` line added to the first.)

In `LemmaScreen.test.tsx`, add `replace: vi.fn()` to the hoisted `mocks` (line 11) and to the router mock (line 78), reset it beside `mocks.push.mockReset()` (line 115), and change the assertion at line 396 from `mocks.push` to `mocks.replace`, keeping its test name and comment. The neighbouring comment at line 400 already anticipates this — it reads "A lemma change in place -- router.replace, or a deep link landing on the...".

- [ ] **Step 2: Run them and watch them fail**

```bash
cd apps/mobile && pnpm vitest run src/screens/RootRoute.test.tsx src/screens/LemmaScreen.test.tsx
```

Expected: both fail with `replace` never called and `push` called instead.

- [ ] **Step 3: Switch both call sites**

`app/root/[buckwalter].tsx:280`:

```tsx
        // replace, not push: paging is a pager, not a trail. Pushing left one
        // screen per Next on a stack the reader can only leave by backing out
        // of every root they passed, and root screens are outside the tab
        // group, so there is no tab bar to escape to either.
        onNavigate={(target) => router.replace(`/root/${encodeURIComponent(target)}`)}
```

`src/screens/LemmaScreen.tsx:216`:

```tsx
            ? (target) => router.replace(`/lemma/${encodeURIComponent(target)}?from=${source}`)
```

Keep the `?from=` ranking: it is what the arrows page along, and dropping it dims them (Task 19).

- [ ] **Step 4: Run the tests**

```bash
cd apps/mobile && pnpm vitest run src/screens/RootRoute.test.tsx src/screens/LemmaScreen.test.tsx
```

Expected: PASS. `drops the old neighbours while the new lemma is still resolving` must pass unmodified — it already covers a lemma changing in place.

- [ ] **Step 5: Mutation-check**

1. `router.replace` -> `router.push` in the root route. Expect FAIL on `links Previous and Next to the hijāʾī neighbours` — `mocks.replace` never called.
2. Same swap in `LemmaScreen`. Expect FAIL on `pages through the ranking it was entered from` — same reason.

Restore by re-editing.

- [ ] **Step 6: Full suite**

```bash
cd apps/mobile && pnpm lint && pnpm type-check && pnpm test
```

Expected: green. Nothing outside the two suites should need editing; a third suite failing means something else was calling these paths.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/root apps/mobile/src/screens/LemmaScreen.tsx apps/mobile/src/screens/LemmaScreen.test.tsx apps/mobile/src/screens/RootRoute.test.tsx
git commit -m "fix(mobile): page between roots and lemmas without stacking screens"
```

---

### Task 5: Device checks for the four fixes

**Files:**
- Modify: `README.md` (`## M4 Dictionary + Search Smoke Test`)
- Modify: `docs/plans/phase-m5c-device-fixes.md` (the verification log below)

- [ ] **Step 1: Repin the build floor**

The preamble pins `7d5f7b3`. Repin to the commit from Task 4 (`git rev-parse --short HEAD`) and extend the "fails for the wrong reasons" sentence: before that commit a concordance tap lands on the wrong ayah in the second half of a long surah, the last row of every list sits under the gesture bar, and Previous/Next stacks a screen per tap.

- [ ] **Step 2: Add checks 44-47**

```
44. Open a root with a long concordance and scroll to the last row: there is
    clear space under it, above the gesture bar. Same at the end of Dictionary
    → Browse, Search results, the word-by-word screen, About and a word-detail
    screen. Repeat with 3-button navigation turned on — the space shrinks but
    never becomes an overlap, and no list ends with an absurd gap.
45. Root قول → any occurrence in the second half of a long surah (16:90:6 and
    21:73:11 are the two that failed): the reader opens **on that ayah**, with
    no scrolling seen on the way and no intermediate ayah flashing past. Check
    2:38:6 and 2:85:16 the same way. Then go Home: the continue-reading card
    names the ayah you actually read, not one the landing passed over.
46. Root ملء (one occurrence, five forms) → tap Form VIII: the rows do not dim,
    no spinner appears under them, and nothing on screen moves except the rows
    swapping. Tap it again for the whole list back. Repeat on قول scrolled a few
    rows down — still no dim, still no jump.
47. Dictionary → any root → Next five times → press back **once**: you are in
    Dictionary, not four roots back. Same from Most used → Lemmas with the lemma
    arrows. Each new root opens at the top of its own concordance, not at the
    scroll offset of the one before it.
```

- [ ] **Step 3: Add the verification-log rows**

Add `| 44 |` through `| 47 |` rows to the table at the end of this plan.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/plans/phase-m5c-device-fixes.md
git commit -m "docs(mobile): device checks for the M5c device-run fixes"
```

- [ ] **Step 5: Stop and ask for the §5 review**

Task 2 changes when `recordReadingPosition` fires, which is a write to the on-device user DB — a §5 trigger. `/code-review` is user-triggered and the agent cannot launch it. Ask the owner to run plain `/code-review` (Pro plan, local; **never** `ultra` without asking), then fix what is real and say in writing which findings are declined and why.

- [ ] **Step 6: Build the APK**

```bash
cd apps/mobile && eas build --platform android --profile preview --non-interactive
```

Confirm the upload is ~36-43 MB. A ~5 MB upload means `.easignore` dropped the bundled DB and every check fails for the wrong reason. Hand the owner the install link and the full list: **34-47**, plus M4's 28-33 and M3's F5, F6, check 27 and the M2 rosette carry-over.

---

## Risks

| # | Risk | Mitigation |
| --- | --- | --- |
| R1 | Rendering 255 ayah cards on a deep link is slow enough to feel broken | The list is behind a spinner for exactly that window, so it reads as loading rather than as a freeze. Device check 45 is the measurement; if it is unacceptable on the owner's hardware the fallback is the measured-offset approach (option 2 of the original three), which does not mount ahead |
| R2 | The retry loop never sees a failure because FlatList reports it late, so the reader is revealed at the top | The reveal only happens after a full `SCROLL_RETRY_DELAY_MS` window with no failure, and `scrollToIndex` is re-issued on every attempt, so a late failure just costs one more attempt |
| R3 | `router.replace` swaps params in place instead of remounting, so the new root inherits the previous one's scroll offset | expo-router 57 sends `REPLACE` to the stack navigator (`build/global-state/getNavigationAction.js:51-58` leaves the type alone for a stack), and a stack REPLACE assigns a fresh route key, which remounts. Not taken on trust: device check 47's last sentence is exactly this. If it fails, add a `resetKey` prop to `ConcordanceList` that scrolls to offset 0 when the root or lemma changes — deliberately *not* on a filter change, which must stay frozen |
| R4 | The global safe-area mock hides a real provider problem from every suite at once | The hook has no branch to hide; the value it produces is only ever spent on padding, and device check 44 is the gate that the real inset is non-zero |
| R5 | Suppressing the footer spinner during a replace hides a genuinely slow filter | The rows stay on screen throughout, and the heading above them already recounts. A filter that never lands falls through to the failure notice, which is unchanged |
| R6 | Widening `initialNumToRender` also widens the first `onViewableItemsChanged` batch, so more word prefetches fire at once | Prefetching is capped per ayah by `requestedRef` and viewability only reports rows actually on screen, which the hidden list still bounds to one screenful |

## Rollback

Each task is one commit; none migrate data or change the schema, so `git revert <sha>` is the rollback for any single one. No couplings — the four are independent of each other and of M5b. Task 2 is the only one that changes device-visible persisted behaviour, and reverting it restores the old (wrong-ayah) landing rather than leaving anything inconsistent.

## Corrections made during execution

Task 2's `shows the reader anyway once the retries are spent` was specified
firing `onScrollToIndexFailed` *before* each retry and advancing 150 ms per
iteration. FlatList reports the miss synchronously *from* `scrollToIndex`, so
under the plan's ordering a timer fired in a window where nothing had failed
yet and the reader revealed after 3 attempts, not 12. The test now drives the
failure off `mocks.scrollToIndex.mockImplementation`, which is the real
ordering, and resets the implementation in its own `finally` (the suite's
`beforeEach` only clears calls).

## Out of scope, found while planning

`app/bookmarks.tsx` renders its rows in a plain `View`, not a `FlatList` or `ScrollView`, so a reader with more bookmarks than fit on screen cannot reach the last ones. Unrelated to defects 7-10 and not fixed here. Worth an issue.

## Acceptance criteria

- [ ] `pnpm -r lint`, `pnpm -r type-check`, `pnpm --filter @quran-corpus/mobile test`, `pnpm --filter @quran-corpus/data test` and `pnpm --filter web test` all pass.
- [ ] `ConcordanceList.test.tsx`'s `holds the previous rows on screen until the new list has its first page` passes **unmodified** — Task 3 removes the dim, not the freeze.
- [ ] `SurahReader.test.tsx`'s `does not scroll for an ayah it is already showing` passes unmodified.
- [ ] `LemmaScreen.test.tsx`'s `drops the old neighbours while the new lemma is still resolving` passes unmodified.
- [ ] Each of Tasks 2, 3 and 4 has a recorded mutation-check: the named edit made the named test fail, and the test passed again after the edit was reversed **by re-editing**.
- [ ] **§5 satisfied:** `/code-review` run by the owner after Task 5, every finding fixed or declined in writing.
- [ ] Device checks 44-47 run on real hardware from one `preview` APK and recorded below.

## Verification log

| Check | Device / build | Date | Result |
| --- | --- | --- | --- |
| 44 | owner device / preview `354f3e09` (`60ff6a5`) | 2026-08-23 | pass |
| 45 | owner device / preview `354f3e09` (`60ff6a5`) | 2026-08-23 | pass |
| 46 | owner device / preview `354f3e09` (`60ff6a5`) | 2026-08-23 | pass |
| 47 | owner device / preview `354f3e09` (`60ff6a5`) | 2026-08-23 | pass |

## Mutation-check log

| Task | Mutation | Test that failed | Restored |
| --- | --- | --- | --- |
| 2 | dropped `positionedRef.current &&` from the viewability gate | `does not record a reading position before the deep-link scroll lands` — `expected "spy" to not be called at all, but actually been called 1 times` | re-edited, file diffed identical |
| 2 | `initialNumToRender={DEFAULT_INITIAL_RENDER}` unconditionally | `renders far enough down the list for the deep-linked ayah to exist` — `expected '10' to be '255'` | re-edited |
| 2 | deleted the `attemptsRef.current >= MAX_SCROLL_ATTEMPTS` branch | `shows the reader anyway once the retries are spent` — `expected <div …(2)><span></span></div> to be null` | re-edited |
| 2 | `if (!failedRef.current) return reveal();` -> `return;` | `keeps the reader hidden until the deep-link scroll lands` (and the reading-position test) — `expected <div …(2)><span></span></div> to be null` | re-edited |
| 3 | put the `opacity: replacing ? 0.45 : 1` wrapper back | `holds the previous rows at full opacity, not dimmed` — `expected <div style="opacity: 0.45;">…(1)</div> to be null` | re-edited, file diffed identical |
| 3 | `loading && !replacing` -> `loading` | `shows no footer spinner over rows it is holding` — `expected <span></span> to be null` | re-edited |
| 3 | deleted `setReplacing(true)` from the reset effect's `else` branch | `shows no footer spinner over rows it is holding` — same failure, so the renamed state is wired, not just declared | re-edited |
| 4 | `router.replace` -> `router.push` in the root route | `links Previous and Next to the hijāʾī neighbours` — `expected "spy" to be called with arguments: [ '/root/qwm' ]` | re-edited |
| 4 | same swap in `LemmaScreen` | `pages through the ranking it was entered from` — `expected "spy" to be called with arguments: [ '/lemma/ktb?from=verbs' ]` | re-edited |
