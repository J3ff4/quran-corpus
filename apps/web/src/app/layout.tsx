import type { Metadata, Viewport } from 'next';
import { Amiri, Inter } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { BottomNav } from '../components/shell/BottomNav';
import { SearchProvider } from '../components/search/SearchProvider';
import { ThemeToggle } from '../components/shell/ThemeToggle';

const kfgqpc = localFont({
  src: './fonts/hafs.18.woff2',
  variable: '--font-kfgqpc',
  display: 'swap',
});

const surahNameV4 = localFont({
  src: './fonts/surah-name-v4.woff2',
  variable: '--font-surah-name',
  display: 'swap',
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${kfgqpc.variable} ${amiri.variable} ${inter.variable} ${surahNameV4.variable}`}
    >
      <body className="bg-paper-50 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-[calc(3.5rem+env(safe-area-inset-top))] font-sans text-paper-900 antialiased dark:bg-night-300 dark:text-paper-100">
        {/* Synchronous on purpose: sets `.dark` before content paints (no
            wrong-theme flash). External file so CSP 'self' covers it on
            every page, including the statically prerendered /offline. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts -- must block
            paint to apply the theme class first; ~300B local file, negligible */}
        <script src="/theme-init.js" />
        <SearchProvider>
          <ThemeToggle />
          {children}
          <BottomNav />
        </SearchProvider>
      </body>
    </html>
  );
}
