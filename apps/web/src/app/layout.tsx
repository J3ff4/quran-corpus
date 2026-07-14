import type { Metadata, Viewport } from 'next';
import { Amiri, Inter } from 'next/font/google';
import localFont from 'next/font/local';
import './globals.css';
import { BottomNav } from '../components/shell/BottomNav';
import { SearchProvider } from '../components/search/SearchProvider';

const kfgqpc = localFont({
  src: './fonts/hafs.18.woff2',
  variable: '--font-kfgqpc',
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
    <html lang="en" className={`${kfgqpc.variable} ${amiri.variable} ${inter.variable}`}>
      <body className="bg-paper-50 pb-[calc(4rem+env(safe-area-inset-bottom))] font-sans text-paper-900 antialiased dark:bg-night-300 dark:text-paper-100">
        <SearchProvider>
          {children}
          <BottomNav />
        </SearchProvider>
      </body>
    </html>
  );
}
