'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { uiLocales, type UiLocaleCode } from '@quran-corpus/config/i18n/locales';
import { contentLanguage, scripts, type ScriptCode } from '@quran-corpus/config/i18n/script';
import { SCRIPT_COOKIE, UI_LOCALE_COOKIE } from '../../lib/locale';
import { writeCookie } from '../../lib/cookies';

const ROW =
  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors';
const SELECTED = 'bg-paper-100 text-paper-900 dark:bg-night-200 dark:text-paper-100';
const IDLE = 'text-paper-600 hover:bg-paper-100 dark:text-paper-400 dark:hover:bg-night-200';

/**
 * Interface-language picker, written as a disclosure: a summary button that
 * reveals the locale list, and -- only for a locale that has two alphabets --
 * the script row under it.
 *
 * The preference is stored in a cookie rather than localStorage because the
 * server renders the localized names. The selection shown is always the
 * server's (`locale`/`script` props), never a local optimistic copy.
 */
export function LocaleSwitcher({
  locale,
  script,
}: {
  locale: UiLocaleCode;
  script: ScriptCode;
}) {
  const router = useRouter();
  const panelId = useId();
  const [open, setOpen] = useState(false);

  // No optimistic selection state: the props ARE the server's answer, so what
  // the control shows is what the page is actually rendered in. A browser that
  // silently drops the cookie (blocked, or a full jar -- the case writeCookie's
  // boolean exists for) leaves the props unchanged, and the control stays on
  // the language the page is really in instead of lying about the write.
  const current = uiLocales.find((l) => l.code === locale) ?? uiLocales[0]!;
  // Only offer the row for a language the corpus carries in two alphabets;
  // elsewhere it would be a control that changes nothing (check 384). Asked of
  // the shared module rather than restated here, so a second two-script
  // language reaches this picker on its own.
  //
  // The second clause is the way back. Since the script cookie reaches any
  // `?lang=uz` page whatever the UI locale is, a reader who sets Cyrillic and
  // then switches the UI to English still sees Cyrillic content -- and on the
  // first clause alone the control that undoes it is no longer rendered
  // anywhere. Keep it while a non-default script is stored.
  const showScripts = contentLanguage(locale, 'cyrillic') !== locale || script !== 'latin';

  function pick(name: string, value: string) {
    writeCookie(name, value);
    // Without this the App Router serves the cached server render and the new
    // language appears only on the next hard navigation (#57).
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left text-paper-700 transition-colors hover:bg-paper-100 dark:text-paper-300 dark:hover:bg-night-200"
      >
        <span>Language</span>
        <span className="text-sm text-paper-500 dark:text-paper-400">{current.nativeLabel}</span>
      </button>

      <div id={panelId} hidden={!open} className="pl-3">
        <ul>
          {uiLocales.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                aria-pressed={l.code === locale}
                onClick={() => pick(UI_LOCALE_COOKIE, l.code)}
                className={`${ROW} ${l.code === locale ? SELECTED : IDLE}`}
              >
                <span>{l.nativeLabel}</span>
                <span className="text-xs text-paper-500 dark:text-paper-400">{l.label}</span>
              </button>
            </li>
          ))}
        </ul>

        {showScripts && (
          <ul className="mt-1 border-t border-paper-200 pt-1 dark:border-night-100">
            {scripts.map((s) => (
              <li key={s.code}>
                <button
                  type="button"
                  aria-pressed={s.code === script}
                  onClick={() => pick(SCRIPT_COOKIE, s.code)}
                  className={`${ROW} ${s.code === script ? SELECTED : IDLE}`}
                >
                  <span>{s.nativeLabel}</span>
                  <span className="text-xs text-paper-500 dark:text-paper-400">{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
