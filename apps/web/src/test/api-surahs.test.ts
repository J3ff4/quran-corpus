// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

const surahsStub = [
  { id: 1, name_arabic: 'الفاتحة', name_translit: 'Al-Fatihah', name_translation: 'The Opening', revelation_type: 'meccan', ayah_count: 7, order_number: 1 },
  { id: 2, name_arabic: 'البقرة', name_translit: 'Al-Baqarah', name_translation: 'The Cow', revelation_type: 'medinan', ayah_count: 286, order_number: 2 },
];

vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));
vi.mock('@quran-corpus/data', () => ({ getAllSurahs: vi.fn(async () => surahsStub) }));

import { GET } from '../app/api/surahs/route';

describe('GET /api/surahs', () => {
  it('returns only {id,name_translit,ayah_count}', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([
      { id: 1, name_translit: 'Al-Fatihah', ayah_count: 7 },
      { id: 2, name_translit: 'Al-Baqarah', ayah_count: 286 },
    ]);
  });

  it('returns 500 JSON when the DB throws', async () => {
    const data = await import('@quran-corpus/data');
    vi.mocked(data.getAllSurahs).mockRejectedValueOnce(new Error('boom'));
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to load surahs' });
  });
});
