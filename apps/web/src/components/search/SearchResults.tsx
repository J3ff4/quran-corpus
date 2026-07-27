'use client';

import Link from 'next/link';
import { TypingText } from '../ui/TypingText';
import type { SearchResult, JumpVerse, VerseHit } from '@quran-corpus/data';

// Snippet matches are wrapped by FTS5 in STX (code 2) / ETX (code 3) sentinel
// bytes. Split on those bytes and wrap odd segments in <mark> as text nodes
// only — never dangerouslySetInnerHTML (OWASP).
const SENTINEL_RE = new RegExp(`[${String.fromCharCode(2)}${String.fromCharCode(3)}]`);

function Highlighted({ text }: { text: string }) {
  const parts = text.split(SENTINEL_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

function JumpSection({
  jump,
  onNavigate = () => {},
}: {
  jump: JumpVerse;
  onNavigate?: () => void;
}) {
  if (jump.ayah_number === null) {
    return (
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-paper-500">Jump to</h2>
        <Link
          href={`/surah/${jump.surah_id}`}
          onClick={onNavigate}
          className="text-paper-900 dark:text-paper-100 underline"
        >
          Surah {jump.surah_id}
        </Link>
      </section>
    );
  }
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-paper-500">Jump to</h2>
      <Link href={`/surah/${jump.surah_id}?ayah=${jump.ayah_number}`} onClick={onNavigate} className="block">
        <span className="text-xs text-paper-500">{`${jump.surah_id}:${jump.ayah_number}`}</span>
        <p dir="rtl" className="font-arabic text-2xl leading-loose text-paper-900 dark:text-paper-100">
          {jump.words.length > 0
            ? jump.words.map((w) => (
                <span key={w.position}>
                  {w.position === jump.highlightPosition ? (
                    <mark>{w.text_arabic}</mark>
                  ) : (
                    w.text_arabic
                  )}{' '}
                </span>
              ))
            : jump.text_uthmani}
        </p>
      </Link>
    </section>
  );
}

export function SearchResults({
  result,
  onNavigate = () => {},
}: {
  result: SearchResult;
  onNavigate?: () => void;
}) {
  const { jump, verses, roots } = result;
  const empty = !jump && verses.length === 0 && roots.length === 0;
  if (empty) {
    return <TypingText text="No results." className="py-8 text-center text-paper-500" />;
  }
  return (
    <div>
      {jump && <JumpSection jump={jump} onNavigate={onNavigate} />}

      {verses.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-paper-500">Verses</h2>
          <ul className="space-y-3">
            {verses.map((v: VerseHit, i) => (
              <li key={`${v.source}-${v.surah_id}-${v.ayah_number}-${i}`}>
                <Link href={`/surah/${v.surah_id}?ayah=${v.ayah_number}`} onClick={onNavigate} className="block">
                  <span className="text-xs uppercase text-paper-400">
                    {`${v.surah_id}:${v.ayah_number} · ${v.source}`}
                  </span>
                  <p
                    {...(v.source === 'ar' ? { dir: 'rtl' } : {})}
                    className={
                      v.source === 'ar'
                        ? 'font-arabic text-xl leading-loose text-paper-800 dark:text-paper-200'
                        : 'text-paper-800 dark:text-paper-200'
                    }
                  >
                    <Highlighted text={v.snippet} />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {roots.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-paper-500">Roots</h2>
          <ul className="flex flex-wrap gap-2">
            {roots.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/dictionary/${r.root_buckwalter}`}
                  onClick={onNavigate}
                  className="rounded-full bg-paper-200 px-3 py-1 text-sm dark:bg-night-100"
                >
                  <span className="font-arabic">{r.root_arabic}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
