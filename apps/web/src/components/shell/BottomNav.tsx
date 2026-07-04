'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SearchSheet } from '../search/SearchSheet';

interface LinkItem {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  icon: ReactNode;
}

const ICON = 'h-6 w-6';

const HomeIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
);

const BookIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 5a2 2 0 0 1 2-2h5v18H6a2 2 0 0 1-2-2z" />
    <path d="M20 5a2 2 0 0 0-2-2h-5v18h5a2 2 0 0 0 2-2z" />
  </svg>
);

const DictIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 6c-1.5-1.2-3.5-2-6-2H3v14h3c2.5 0 4.5.8 6 2" />
    <path d="M12 6c1.5-1.2 3.5-2 6-2h3v14h-3c-2.5 0-4.5.8-6 2" />
    <path d="M12 6v14" />
  </svg>
);

const SearchIcon = (
  <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const LINK_ITEMS: LinkItem[] = [
  { href: '/', label: 'Home', match: (p) => p === '/', icon: HomeIcon },
  {
    href: '/surah',
    label: 'Read',
    match: (p) => p.startsWith('/surah') || p.startsWith('/word'),
    icon: BookIcon,
  },
  { href: '/dictionary', label: 'Dictionary', match: (p) => p.startsWith('/dictionary'), icon: DictIcon },
];

const itemClass = 'flex h-16 flex-col items-center justify-center gap-1 text-xs';
const activeColor = 'text-paper-900 dark:text-paper-100';
const idleColor = 'text-paper-500 dark:text-paper-400';

export function BottomNav() {
  const pathname = usePathname() ?? '/';
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-paper-200 bg-paper-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-night-100 dark:bg-night-300/95"
      >
        {LINK_ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`${itemClass} ${active ? activeColor : idleColor}`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          aria-label="Search"
          onClick={() => setSearchOpen(true)}
          className={`${itemClass} ${searchOpen ? activeColor : idleColor}`}
        >
          {SearchIcon}
          <span>Search</span>
        </button>
      </nav>
      <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
