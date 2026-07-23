'use client';

import { useState } from 'react';
import type { RootForm, ConcordanceEntry } from '@quran-corpus/data';
import { FormFilterChips } from './FormFilterChips';
import { ConcordanceList } from './ConcordanceList';

interface ConcordanceSectionProps {
  forms: RootForm[];
  initialConcordance: ConcordanceEntry[];
  total: number;
  rootBw: string;
}

/** Owns the derived-form filter selection and coordinates FormFilterChips
 *  (the interactive replacement for the old static "Derived forms" list)
 *  with ConcordanceList (which tags each row and refetches when the
 *  selection changes). Toggling a chip adds/removes its id from the
 *  selection -- multi-select, "nothing selected" means "All". */
export function ConcordanceSection({
  forms,
  initialConcordance,
  total,
  rootBw,
}: ConcordanceSectionProps) {
  const [selected, setSelected] = useState<number[]>([]);

  function toggle(formId: number) {
    setSelected((prev) =>
      prev.includes(formId) ? prev.filter((id) => id !== formId) : [...prev, formId],
    );
  }

  return (
    <div className="space-y-4">
      <FormFilterChips forms={forms} selected={selected} onToggle={toggle} />
      <ConcordanceList
        initialEntries={initialConcordance}
        total={total}
        rootBw={rootBw}
        forms={forms}
        selectedFormIds={selected}
      />
    </div>
  );
}
