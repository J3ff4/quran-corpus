import { createClient, type Client } from '@libsql/client';

export function createDatabase(url = 'file:quran.db'): Client {
  return createClient({ url });
}

export type { Client };
