import type { Metadata, Viewport } from 'next';
import { Amiri } from 'next/font/google';
import './globals.css';

const amiri = Amiri({
  weight: ['400', '700'],
  subsets: ['arabic', 'latin'],
  variable: '--font-arabic',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Quran Corpus',
  description: 'Word-by-word Quranic morphology, grammar, and translations',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Quran Corpus',
  },
};

export const viewport: Viewport = {
  themeColor: '#1f1a14',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={amiri.variable}>
      <body className="bg-paper-50 text-paper-900 antialiased dark:bg-night-300 dark:text-paper-100">
        {children}
      </body>
    </html>
  );
}
