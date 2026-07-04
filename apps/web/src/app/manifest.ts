import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest & { scope?: string } {
  return {
    name: 'Quran Corpus',
    short_name: 'Quran',
    description: 'Word-by-word Quranic morphology, grammar, and translations',
    start_url: '/',
    display: 'standalone',
    background_color: '#faf8f3',
    theme_color: '#1f1a14',
    orientation: 'portrait',
    scope: '/',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
