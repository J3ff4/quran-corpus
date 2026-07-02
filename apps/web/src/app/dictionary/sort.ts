export type DictionarySort = 'alpha' | 'freq';

export function parseSort(v: string | undefined): DictionarySort {
  return v === 'freq' ? 'freq' : 'alpha';
}
