import Link from 'next/link';

const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'uz', label: 'Uzbek' },
  { code: 'ru', label: 'Russian' },
] as const;

interface LanguageBarProps {
  surahId: number;
  activeLang: string;
}

export function LanguageBar({ surahId, activeLang }: LanguageBarProps) {
  return (
    <div className="mb-6 flex gap-2">
      {LANGUAGES.map(({ code, label }) => (
        <Link
          key={code}
          href={`/surah/${surahId}?lang=${code}`}
          className={
            activeLang === code
              ? 'rounded-full bg-paper-900 px-3 py-1 text-xs text-paper-50 dark:bg-paper-100 dark:text-paper-900'
              : 'rounded-full bg-paper-200 px-3 py-1 text-xs text-paper-600 transition-colors hover:bg-paper-300 dark:bg-night-100 dark:text-paper-400'
          }
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
