import Link from 'next/link';

export const metadata = {
  title: 'About & Credits — Quran Corpus',
  description: 'Data sources, licenses, and attribution for the Quran Corpus app.',
};

// Dynamic so the per-request CSP nonce reaches inline scripts (see app/page.tsx).
export const dynamic = 'force-dynamic';

interface Source {
  name: string;
  href: string;
  provides: string;
  license: string;
  note: string;
}

// Only sources whose data actually ships in the app are credited here, per
// each source's license terms (CLAUDE.md §11). Add entries as new datasets
// (e.g. QuranEnc translations) are imported.
const sources: Source[] = [
  {
    name: 'Quranic Arabic Corpus',
    href: 'https://corpus.quran.com',
    provides: 'Word-by-word morphology, part-of-speech tags, roots and lemmas.',
    license: 'GNU General Public License',
    note: 'Annotation © Kais Dukes, Language Research Group, University of Leeds. Used with the source clearly indicated and linked, as the license requires.',
  },
  {
    name: 'Tanzil Project',
    href: 'https://tanzil.net',
    provides: 'The verified Uthmani Arabic text of the Quran.',
    license: 'Tanzil terms of use',
    note: 'Quran text is distributed by the Tanzil project and used unmodified, with attribution and a link to tanzil.net as required.',
  },
  {
    name: "Lane's Lexicon",
    href: 'https://github.com/qurandev/roots',
    provides: 'Classical Arabic root definitions in the Quranic Dictionary.',
    license: 'Public domain',
    note: "An Arabic-English Lexicon by Edward William Lane (1863), long in the public domain, compiled per Quranic root by the qurandev/roots project; surfaced per-root alongside the corpus's derived forms.",
  },
  {
    name: 'NLLB-200 (Meta AI)',
    href: 'https://huggingface.co/facebook/nllb-200-distilled-600M',
    provides: 'Uzbek word-by-word glosses, machine-translated from the English glosses.',
    license: 'CC-BY-NC 4.0 (model)',
    note: 'Uzbek per-word glosses are machine-assisted (NLLB-200), generated from the corpus English glosses and partially human-reviewed. Marked (en) where an Uzbek gloss is not yet available.',
  },
];

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <nav className="mb-6">
        <Link
          href="/surah"
          className="text-sm text-paper-500 transition-colors hover:text-paper-800 dark:hover:text-paper-200"
        >
          ← Back to Quran
        </Link>
      </nav>

      <h1 className="mb-2 text-2xl font-semibold text-paper-900 dark:text-paper-100">
        About &amp; Credits
      </h1>
      <p className="mb-8 max-w-prose text-paper-600 dark:text-paper-400">
        This app presents the Quranic corpus — Arabic text, word-by-word
        morphology, and grammar — built on open datasets. We are grateful to the
        projects below, whose work makes this possible.
      </p>

      <h2 className="mb-4 text-lg font-semibold text-paper-900 dark:text-paper-100">
        Data sources
      </h2>
      <ul className="space-y-4">
        {sources.map((source) => (
          <li
            key={source.name}
            className="rounded-lg border border-paper-200 p-4 dark:border-night-100"
          >
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <a
                href={source.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-paper-900 underline decoration-paper-300 underline-offset-2 transition-colors hover:decoration-paper-600 dark:text-paper-100 dark:decoration-night-100"
              >
                {source.name}
              </a>
              <span className="shrink-0 rounded-full bg-paper-100 px-2.5 py-0.5 text-xs text-paper-600 dark:bg-night-100 dark:text-paper-400">
                {source.license}
              </span>
            </div>
            <p className="mb-1 text-xs text-paper-400">{new URL(source.href).host}</p>
            <p className="mb-1 text-sm text-paper-700 dark:text-paper-300">
              {source.provides}
            </p>
            <p className="text-sm text-paper-500 dark:text-paper-400">{source.note}</p>
          </li>
        ))}
      </ul>

      <p className="mt-8 max-w-prose text-sm text-paper-500 dark:text-paper-400">
        Translations from additional sources (e.g.{' '}
        <a
          href="https://quranenc.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          QuranEnc
        </a>
        ) will be credited here as they are added.
      </p>
    </main>
  );
}
