import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'book'
  | 'bookmark'
  | 'settings'
  | 'words'
  | 'translate'
  | 'dictionary'
  | 'menu'
  | 'info'
  | 'search'
  | 'back'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'play'
  | 'pause'
  | 'skipBack'
  | 'skipForward'
  | 'repeat';

/**
 * Path data ported verbatim from web so the two products draw one glyph set:
 * home / book / dictionary / menu from apps/web/src/components/shell/BottomNav.tsx,
 * bookmark from DrawerMenu.tsx. `settings` and `words` have no web counterpart
 * -- the web drawer has no settings entry and reaches word-by-word from the
 * reader's own header -- so they are drawn here.
 *
 * RN has no currentColor, so the stroke arrives as a prop from the theme.
 */
const PATHS: Record<IconName, string[]> = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V21h14V9.5'],
  book: [
    'M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2z',
    'M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2z',
  ],
  bookmark: ['M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1z'],
  settings: [
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    'M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-1.7-1l-.4-2.6h-4l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.3 1 2-3.4z',
  ],
  // Four cells, not a page of lines: the word-by-word screen is a chip grid,
  // and a lines glyph would be the `book` icon again at a smaller size.
  words: ['M4 5h6.5v5.5H4z', 'M13.5 5H20v5.5h-6.5z', 'M4 13.5h6.5V19H4z', 'M13.5 13.5H20V19h-6.5z'],
  // A globe, not a pair of letterforms: the reader's language control picks
  // the *translation* language, and a Latin "A" beside an Arabic glyph would
  // read as the word-by-word toggle. Drawn here -- web's LanguageBar is a text
  // pill row with no icon to port.
  translate: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'M3.5 9h17M3.5 15h17',
    'M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9s1.2-6.5 3.6-9z',
  ],
  dictionary: [
    'M12 6c-1.5-1.2-3.5-2-6-2H3v14h3c2.5 0 4.5.8 6 2',
    'M12 6c1.5-1.2 3.5-2 6-2h3v14h-3c-2.5 0-4.5.8-6 2',
    'M12 6v14',
  ],
  menu: ['M4 6h16M4 12h16M4 18h16'],
  // The About row's glyph, and the only one of the three Menu rows with no
  // icon already. Ring plus stem plus a zero-length dot: the dot is drawn as a
  // 0.2-unit segment rather than a filled circle so it takes the same round
  // cap and stroke width as everything else in the set.
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v6', 'M12 7.4v.2'],
  // Circle plus handle, matching web's SearchTrigger (circle cx=11 cy=11 r=7,
  // handle from 20,20). The circle is drawn as two arcs closing back on
  // itself, the same technique `translate`'s outer ring above uses.
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'M20 20l-3.5-3.5'],
  // Chevron only, no shaft: mockup 1e's back affordance, and the reader draws
  // its own header now that the native toolbar is gone.
  back: ['M15 5l-7 7 7 7'],
  // The dictionary pager's two arrows. Drawn rather than reusing `back` (and a
  // mirrored copy of it) because these sit inside a 34pt circle where being
  // half a unit off centre is visible: both spans are x 8.5..15.5 and y 5..19,
  // so each is exactly centred on the 24 viewBox in both axes. A `‹` glyph was
  // what shipped first, and a text chevron carries its font's own side
  // bearings -- it cannot be centred by the layout that holds it.
  chevronLeft: ['M15.5 5l-7 7 7 7'],
  chevronRight: ['M8.5 5l7 7-7 7'],
  // The same chevron a quarter turn on, for a disclosure that is open.
  chevronDown: ['M5 8.5l7 7 7-7'],
  // The recitation transport. Outlines, not filled shapes: every glyph above
  // is a stroke at `fill="none"`, and a solid triangle beside them would read
  // as a different icon set.
  play: ['M8 5l11 7-11 7z'],
  pause: ['M9 5v14', 'M15 5v14'],
  skipBack: ['M18 5v14l-10-7z', 'M6 5v14'],
  skipForward: ['M6 5v14l10-7z', 'M18 5v14'],
  // Continuous play. The two rails have to run the full width and turn back on
  // themselves for this to read as a loop; the first attempt ended each rail in
  // a one-unit stub under a detached arrowhead, which drew two arrows passing
  // each other rather than a cycle (device, 2026-08-26).
  repeat: ['M17 2l4 4-4 4', 'M3 12v-2a4 4 0 0 1 4-4h14', 'M7 22l-4-4 4-4', 'M21 12v2a4 4 0 0 1-4 4H3'],
};

export function Icon({
  name,
  color,
  size = 24,
  testID,
}: {
  name: IconName;
  color: ColorValue;
  size?: number;
  /** So a test can say *which* glyph was drawn without asserting on path data,
   *  which is retuned whenever a chevron is re-centred. */
  testID?: string;
}) {
  return (
    <Svg
      // Spread, not `testID={testID}`: exactOptionalPropertyTypes rejects an
      // explicit undefined for an optional prop -- the same shape BrowseList's
      // rows use.
      {...(testID ? { testID } : {})}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name].map((d) => (
        <Path key={d} d={d} />
      ))}
    </Svg>
  );
}
