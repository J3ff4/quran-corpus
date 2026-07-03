import { describe, it, expect, vi } from 'vitest';

vi.mock('@quran-corpus/data', () => ({
  EMPTY_SEARCH_RESULT: { jump: null, verses: [], roots: [] },
  search: vi.fn(async (_db: unknown, q: string) => ({
    jump: null,
    verses: [{ surah_id: 1, ayah_number: 1, source: 'en', snippet: `hit:${q}` }],
    roots: [],
  })),
}));
vi.mock('../lib/db', () => ({ getDatabase: vi.fn(async () => ({})) }));

import { GET } from '../app/api/search/route';

function req(q: string): Request {
  return new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`);
}

describe('GET /api/search', () => {
  it('returns search results for a valid query', async () => {
    const res = await GET(req('throne'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verses[0].snippet).toBe('hit:throne');
  });
  it('returns empty result for a blank query', async () => {
    const body = await (await GET(req('   '))).json();
    expect(body).toEqual({ jump: null, verses: [], roots: [] });
  });
  it('returns empty result for an over-long query', async () => {
    const body = await (await GET(req('x'.repeat(101)))).json();
    expect(body.verses).toEqual([]);
  });
});
