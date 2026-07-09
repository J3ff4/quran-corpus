import { WbwWordCell } from './WbwWordCell';
import type { WbwAyah } from './types';

export function WbwAyahBlock({ ayah, pageLang }: { ayah: WbwAyah; pageLang?: string }) {
  return (
    <section id={`ayah-${ayah.ayahNumber}`} className="scroll-mt-20 border-b border-paper-200 py-5 dark:border-night-100">
      <span className="mb-3 inline-block rounded-full bg-paper-100 px-2.5 py-0.5 text-xs font-medium text-paper-500 dark:bg-night-200 dark:text-paper-400">
        {ayah.ayahNumber}
      </span>
      {ayah.cells.length > 0 ? (
        <div className="flex flex-wrap gap-2" dir="rtl">
          {ayah.cells.map((cell) => (
            <WbwWordCell key={cell.position} cell={cell} {...(pageLang ? { pageLang } : {})} />
          ))}
        </div>
      ) : (
        <p className="font-arabic text-2xl leading-loose text-paper-900 dark:text-paper-100" dir="rtl">
          {ayah.textUthmani}
        </p>
      )}
    </section>
  );
}
