import { describe, it, expect } from 'vitest';
import manifest from '../app/manifest';

describe('manifest', () => {
  it('has correct name and start_url', () => {
    const m = manifest();
    expect(m.name).toBe('Quran Corpus');
    expect(m.start_url).toBe('/surah');
    expect(m.display).toBe('standalone');
  });

  it('has separate any and maskable icon entries', () => {
    const m = manifest();
    const purposes = m.icons?.map((i) => i.purpose) ?? [];
    expect(purposes).toContain('any');
    expect(purposes).toContain('maskable');
  });

  it('does not combine maskable and any in a single entry', () => {
    const m = manifest();
    const combined = m.icons?.find((i) => i.purpose === 'maskable any');
    expect(combined).toBeUndefined();
  });
});
