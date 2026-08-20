import { useAppSettings } from '@/settings/settingsStore';
import { arabicScales, typography } from './tokens';

export interface ArabicSizes {
  /** Ayah text in the reader, and the basmala banner above it. */
  reader: number;
  /** The single hero word on the sheet, the word screen and the root screen. */
  title: number;
  banner: number;
}

/**
 * The Arabic sizes for the reader's chosen step.
 *
 * Scales the Arabic *relative to* the UI text -- see the settingKeys comment in
 * settingsStore.tsx for why that is not the `fontScale` setting this app
 * deliberately removed. Android's own font scaling still composes on top.
 *
 * Rounded: RN accepts fractional font sizes but Hafs's metrics land on whole
 * pixels, and a 22.4px run against a 22px one in the next card is visible.
 */
export function useArabicSizes(): ArabicSizes {
  const { arabicScale } = useAppSettings();
  // Defensive: the value round-trips through SQLite as text.
  // loadPersistedAppSettings validates it, but a size of NaN crashes the
  // renderer, so this does not depend on that being the only writer.
  const factor = arabicScales[arabicScale] ?? arabicScales.medium;

  return {
    reader: Math.round(typography.arabicReader * factor),
    title: Math.round(typography.arabicTitle * factor),
    banner: Math.round(typography.arabicReader * factor),
  };
}
