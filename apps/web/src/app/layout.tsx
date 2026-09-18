import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { Amiri, Inter } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { BottomNav } from '../components/shell/BottomNav';
import { SearchProvider } from '../components/search/SearchProvider';
import { resolveLocale } from '../lib/locale';

const kfgqpc = localFont({
  src: './fonts/hafs.18.woff2',
  variable: '--font-kfgqpc',
  display: 'swap',
});

const surahNameV2 = localFont({
  src: './fonts/surah-name-v2.woff2',
  variable: '--font-surah-name',
  // 'block' (not 'swap'): the glyphs are PUA codepoints with no fallback
  // rendering, so swap would show a tofu/missing-glyph box during load.
  // block briefly renders invisible text instead, then swaps in once ready.
  display: 'block',
});

// v2 has no glyph for surah 102 (At-Takathur) at all -- kept only as a
// per-surah fallback (see surah.id === 102 checks at the two call sites).
const surahNameV4 = localFont({
  src: './fonts/surah-name-v4.woff2',
  variable: '--font-surah-name-v4',
  display: 'block',
});

const amiri = Amiri({
  weight: ['400', '700'],
  subsets: ['arabic', 'latin'],
  variable: '--font-arabic',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Quran Corpus',
  description: 'Word-by-word Quranic morphology, grammar, and translations',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Quran Corpus',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#1f1a14',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolved here, on the server, so the first paint is already in the stored
  // language -- a post-mount correction would flash the previous one (#51-#53).
  const { locale, script } = resolveLocale(await cookies());

  return (
    <html
      // Deliberately NOT the UI locale yet. The chrome and every translation
      // on the page are still English this phase (R3 defers translating them),
      // so `lang="ru"` would be a WCAG 3.1.1 (Level A) violation: a screen
      // reader would switch to a Russian voice and read English aloud with
      // Russian phonetics -- worse than not offering the locale at all. The
      // localized parts Task 3 adds (surah names) carry their own `lang` on
      // the element; this attribute follows once the chrome does.
      lang="en"
      suppressHydrationWarning
      className={`${kfgqpc.variable} ${amiri.variable} ${inter.variable} ${surahNameV2.variable} ${surahNameV4.variable}`}
    >
      <body className="bg-paper-50 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] font-sans text-paper-900 antialiased dark:bg-night-300 dark:text-paper-100">
        {/* Synchronous on purpose: sets `.dark` before content paints (no
            wrong-theme flash). External file so CSP 'self' covers it on
            every page, including the statically prerendered /offline. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- must block
            paint to apply the theme class first; ~300B local file, negligible */}
        <script src="/theme-init.js" />
        {/* ClampedText's clamp ships in the server-rendered markup, but its
            toggle needs hydration to measure. With JS off there is no button,
            so the crop would be permanent — a definition cut at six lines
            with no fade, no scrollbar and no way to open it. Release the
            ceiling instead: an over-long definition beats an unreachable one.
            `!important` because the clamp is an inline style. Emitted once
            here rather than per instance — a root with several definitions
            renders several boxes and would repeat one global rule. */}
        <noscript>
          <style>{'.clamp-box{max-height:none!important;overflow:visible!important}'}</style>
        </noscript>
        <SearchProvider>
          {children}
          <BottomNav locale={locale} script={script} />
        </SearchProvider>
      </body>
    </html>
  );
}
