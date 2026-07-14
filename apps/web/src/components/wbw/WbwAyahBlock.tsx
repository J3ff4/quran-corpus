import { WbwWordCell } from './WbwWordCell';
import type { WbwAyah } from './types';
import { AyahMedallion } from '../reader/ornaments/AyahMedallion';

export function WbwAyahBlock({ ayah, pageLang }: { ayah: WbwAyah; pageLang?: string }) {
  return (
    <section id={`ayah-${ayah.ayahNumber}`} className="scroll-mt-20 border-b border-paper-200 py-5 dark:border-night-100">
      <AyahMedallion n={ayah.ayahNumber} className="mb-3" />
      {ayah.cells.length > 0 ? (
        <div className="flex flex-wrap gap-2" dir="rtl">
          {ayah.cells.map((cell) => (
            <WbwWordCell key={cell.position} cell={cell} {...(pageLang ? { pageLang } : {})} />
          ))}
        </div>
      ) : (
        <p className="font-arabic text-2xl leading-[2.4] text-paper-900 dark:text-paper-100" dir="rtl">
          {ayah.textUthmani}
        </p>
      )}
    </section>
  );
}
