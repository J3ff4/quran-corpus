export interface FrequencyRow {
  label: string;
  sub?: string | undefined;
  count: number;
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
        {rows.map((r, i) => (
          <tr
            key={`${r.label}-${i}`}
            className="border-b border-paper-100 dark:border-night-50"
          >
            <td className="py-2 pr-2 text-sm text-paper-400 tabular-nums">{i + 1}</td>
            <td className="py-2">
              <span dir="rtl" className="font-arabic text-lg text-paper-900 dark:text-paper-100">
                {r.label}
              </span>
              {r.sub && <span className="ml-2 text-xs text-paper-500">{r.sub}</span>}
            </td>
            <td className="py-2 pl-2 text-right text-sm text-paper-700 tabular-nums dark:text-paper-300">
              {r.count}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
