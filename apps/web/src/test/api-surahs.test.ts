// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

const surahsStub = [
  { id: 1, name_arabic: 'الفاتحة', name_translit: 'Al-Fatihah', name_translation: 'The Opening', revelation_type: 'meccan', ayah_count: 7, order_number: 1 },
  { id: 2, name_arabic: 'البقرة', name_translit: 'Al-Baqarah', name_translation: 'The Cow', revelation_type: 'medinan', ayah_count: 286, order_number: 2 },
];

vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('@quran-corpus/data', () => ({
  getAllSurahs: vi.fn(async () => surahsStub),
  getSurahNames: vi.fn(async () => new Map([[1, { name: 'Fotiha', meaning: null }]])),
}));

import { GET } from '../app/api/surahs/route';

describe('GET /api/surahs', () => {
  it('returns only {id,name,ayah_count}, localized, falling back per surah', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      { id: 1, name: 'Fotiha', ayah_count: 7 },
      { id: 2, name: 'Al-Baqarah', ayah_count: 286 },
    ]);
  });

  it('is privately cached and varies on the cookie it now reads', () => {
    // The body carries the reader's language; a shared cache keyed by URL
    // alone would serve it to the next reader in the wrong one.
    return GET().then((res) => {
      expect(res.headers.get('Cache-Control')).toBe('private, max-age=86400');
      expect(res.headers.get('Vary')).toBe('Cookie');
    });
  });

  it('returns 500 JSON when the DB throws', async () => {
    const data = await import('@quran-corpus/data');
    vi.mocked(data.getAllSurahs).mockRejectedValueOnce(new Error('boom'));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to load surahs' });
  });
});
