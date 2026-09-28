import type { ViewStyle } from 'react-native';

/**
 * The widest a column of content is allowed to grow.
 *
 * Every layout in this app was built and checked at 328-360dp of width, and
 * nothing in it caps: a screen is one full-bleed column, so on a wide display
 * the content does not re-flow, it is pinned to both edges with the middle
 * left empty. On the Tab S10+ in landscape (1400dp, S3 device run 2026-09-27)
 * al-Baqara's first ayah put its Arabic hard against the right edge and
 * `Alif, Lam, Meem.` hard against the left, ~1200dp apart, and a longer
 * translation ran the full width as a single ~200-character line.
 *
 * 640 because body copy here sets around 15-16dp, which puts a full line near
 * 70 characters -- the top of the comfortable range, and the reader pairs two
 * scripts on one row so it needs the room. Below this nothing changes: a phone
 * is 328-360dp and never reaches the cap.
 */
export const MAX_CONTENT_WIDTH = 640;

/** Apply to a scene, a bar, or any other full-bleed container that should stop
 *  growing and centre once the display is wider than a phone. */
export const centredContent: ViewStyle = {
  width: '100%',
  maxWidth: MAX_CONTENT_WIDTH,
  alignSelf: 'center',
};
