import { describe, expect, it } from 'vitest';
import { createExpoSqliteClient } from '../src/expoSqliteClient';

describe('createExpoSqliteClient', () => {
  it('executes plain SQL strings through getAllAsync', async () => {
    const calls: unknown[] = [];
    const db = {
      async getAllAsync(sql: string, params?: unknown[]) {
        calls.push({ sql, params });
        return [{ id: 1, name_translit: 'Al-Fatihah' }];
      },
    };

    const client = createExpoSqliteClient(db);
    const result = await client.execute('SELECT * FROM surahs');

    expect(calls).toEqual([{ sql: 'SELECT * FROM surahs', params: [] }]);
    expect(result.rows).toEqual([{ id: 1, name_translit: 'Al-Fatihah' }]);
  });

  it('executes parameterized statements through getAllAsync', async () => {
    const calls: unknown[] = [];
    const db = {
      async getAllAsync(sql: string, params?: unknown[]) {
        calls.push({ sql, params });
        return [{ id: 7 }];
      },
    };

    const client = createExpoSqliteClient(db);
    const result = await client.execute({ sql: 'SELECT * FROM ayahs WHERE surah_id = ?', args: [1] });

    expect(calls).toEqual([{ sql: 'SELECT * FROM ayahs WHERE surah_id = ?', params: [1] }]);
    expect(result.rows).toEqual([{ id: 7 }]);
  });
});
