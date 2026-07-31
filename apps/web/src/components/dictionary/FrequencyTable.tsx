import Link from 'next/link';

export interface FrequencyRow {
  label: string;
  sub?: string | undefined;
  count: number;
  href?: string | undefined;
}

interface FrequencyTableProps {
  caption: string;
  rows: FrequencyRow[];
}

/** Shared ranked table (rank, Arabic-aware label + optional sub, count). */
export function FrequencyTable({ caption, rows }: FrequencyTableProps) {
  return (
    <table aria-label={caption} className="w-full text-left">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-paper-200 text-xs uppercase tracking-wide text-paper-500 dark:border-night-100">
          <th scope="col" className="py-2 pr-2 font-medium">#</th>
          <th scope="col" className="py-2 font-medium">Form</th>
          <th scope="col" className="py-2 pl-2 text-right font-medium">Count</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const label = (
            <span dir="rtl" className="font-arabic text-lg text-paper-900 dark:text-paper-100">
              {r.label}
            </span>
          );
          // Linked rows carry exactly ONE anchor, on the label. Two earlier
          // shapes were rejected:
          //   - wrapping every cell and marking the rank/count copies
          //     aria-hidden + tabIndex={-1} puts interactive anchors in the DOM
          //     that assistive tech cannot reach;
          //   - stretching the label's link over the row with an inset-0 pseudo
          //     element needs `position: relative` on the <tr>, which WebKit
          //     historically did not honour on table rows. If it doesn't apply,
          //     the overlay resolves against the initial containing block and
          //     one invisible viewport-sized link swallows every click on the
          //     page. Not a risk worth taking on an iOS-first PWA for a larger
          //     hit area.
          // So the click target is the label cell -- and the hover highlight
          // lives on that same anchor, NOT on the <tr>. A row-wide background
          // change is the standard "this whole row is clickable" affordance, so
          // painting it while only the middle cell navigates promises exactly
          // the hit area the stretched-link option was rejected for: hovering
          // the rank or count cell lit the row up and clicking did nothing.
          //
          // The affordance must be visible at REST, not on hover: this is a
          // touch-first PWA, hover never fires there, and a hover-only cue
          // leaves these tables looking exactly like the non-interactive
          // version they replaced -- the navigation would be undiscoverable on
          // a phone. Hence the always-on low-contrast underline (matching
          // RootEntry's link treatment), darkening on hover for pointer users.
          // `block -my-2 py-2` reclaims the cell's padding so a two-glyph lemma
          // like مِن is a full-height tap target rather than a tiny text box.
          const labelContent = (
            <>
              {label}
              {r.sub && <span className="ml-2 text-xs text-paper-500">{r.sub}</span>}
            </>
          );
          return (
            <tr
              key={`${r.label}-${i}`}
              className="border-b border-paper-100 dark:border-night-50"
            >
              <td className="py-2 pr-2 text-sm text-paper-400 tabular-nums">{i + 1}</td>
              <td className="py-2">
                {r.href ? (
                  <Link
                    href={r.href}
                    className="-mx-2 -my-2 block rounded px-2 py-2 underline decoration-paper-300 underline-offset-2 transition-colors hover:bg-paper-200 hover:decoration-paper-600 dark:decoration-night-100 dark:hover:bg-night-100 dark:hover:decoration-paper-400"
                  >
                    {labelContent}
                  </Link>
                ) : (
                  labelContent
                )}
              </td>
              <td className="py-2 pl-2 text-right text-sm text-paper-700 tabular-nums dark:text-paper-300">
                {r.count}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
