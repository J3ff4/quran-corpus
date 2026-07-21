import type { ViewMode } from './ViewToggle';

export const VIEW_MODE_COOKIE = 'wbw-view-mode';

export function isViewMode(v: unknown): v is ViewMode {
  return v === 'card' || v === 'list';
}
