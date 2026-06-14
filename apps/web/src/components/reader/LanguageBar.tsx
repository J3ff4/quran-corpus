'use client';

import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';

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
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  return (
    <div className="mb-6 flex gap-1">
      {LANGUAGES.map(({ code, label }) => {
        const isActive = activeLang === code;
        return (
          <button
            key={code}
            type="button"
            aria-label={label}
            aria-current={isActive ? 'true' : undefined}
            onClick={() => {
              if (!isActive) router.push(`/surah/${surahId}?lang=${code}`);
            }}
            className="relative rounded-full px-3 py-1 text-xs"
          >
            {isActive &&
              (reducedMotion ? (
                <div
                  data-testid="lang-pill"
                  className="absolute inset-0 rounded-full bg-paper-900 dark:bg-paper-100"
                />
              ) : (
                <motion.div
                  data-testid="lang-pill"
                  layoutId="lang-pill"
                  className="absolute inset-0 rounded-full bg-paper-900 dark:bg-paper-100"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              ))}
            <span
              className={
                isActive
                  ? 'relative z-10 text-paper-50 dark:text-paper-900'
                  : 'relative z-10 text-paper-600 transition-colors hover:text-paper-900 dark:text-paper-400 dark:hover:text-paper-200'
              }
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
