// Human labels for Quranic Arabic Corpus morphology codes.
// Source: corpus.quran.com/documentation/tagset.jsp (fetched 2026-07-04).
// Pure static reference — no logic. Any code/tag absent here degrades to the
// raw code at the call site (never crash, never hide).

// 45 part-of-speech codes (every value seen in word_segments.pos_tag).
export const POS_LABELS: Record<string, { en: string; ar?: string }> = {
  // Nominals
  N: { en: 'Noun', ar: 'اسم' },
  PN: { en: 'Proper noun', ar: 'اسم علم' },
  ADJ: { en: 'Adjective', ar: 'صفة' },
  IMPN: { en: 'Imperative verbal noun', ar: 'اسم فعل أمر' },
  PRON: { en: 'Personal pronoun', ar: 'ضمير' },
  DEM: { en: 'Demonstrative pronoun', ar: 'اسم إشارة' },
  REL: { en: 'Relative pronoun', ar: 'اسم موصول' },
  T: { en: 'Time adverb', ar: 'ظرف زمان' },
  LOC: { en: 'Location adverb', ar: 'ظرف مكان' },
  // Verb
  V: { en: 'Verb', ar: 'فعل' },
  // Prepositions & lām prefixes
  P: { en: 'Preposition', ar: 'حرف جر' },
  EMPH: { en: 'Emphatic lām prefix', ar: 'لام التوكيد' },
  IMPV: { en: 'Imperative lām prefix', ar: 'لام الأمر' },
  PRP: { en: 'Purpose lām prefix', ar: 'لام التعليل' },
  // Conjunctions
  CONJ: { en: 'Coordinating conjunction', ar: 'حرف عطف' },
  SUB: { en: 'Subordinating conjunction', ar: 'حرف مصدري' },
  // Determiner
  DET: { en: 'Determiner', ar: 'أل التعريف' },
  // Particles
  ACC: { en: 'Accusative particle', ar: 'حرف نصب' },
  AMD: { en: 'Amendment particle', ar: 'حرف إضراب' },
  ANS: { en: 'Answer particle', ar: 'حرف جواب' },
  AVR: { en: 'Aversion particle', ar: 'حرف ردع' },
  CAUS: { en: 'Particle of cause', ar: 'حرف سببية' },
  CERT: { en: 'Particle of certainty', ar: 'حرف تحقيق' },
  CIRC: { en: 'Circumstantial particle', ar: 'واو الحال' },
  COM: { en: 'Comitative particle', ar: 'واو المعية' },
  COND: { en: 'Conditional particle', ar: 'أداة شرط' },
  EQ: { en: 'Equalization particle', ar: 'حرف تسوية' },
  EXH: { en: 'Exhortation particle', ar: 'حرف تحضيض' },
  EXL: { en: 'Explanation particle', ar: 'حرف تفصيل' },
  EXP: { en: 'Exceptive particle', ar: 'أداة استثناء' },
  FUT: { en: 'Future particle', ar: 'حرف استقبال' },
  INC: { en: 'Inceptive particle', ar: 'حرف ابتداء' },
  INT: { en: 'Particle of interpretation', ar: 'حرف تفسير' },
  INTG: { en: 'Interrogative particle', ar: 'حرف استفهام' },
  NEG: { en: 'Negative particle', ar: 'حرف نفي' },
  PREV: { en: 'Preventive particle', ar: 'حرف كاف' },
  PRO: { en: 'Prohibition particle', ar: 'حرف نهي' },
  REM: { en: 'Resumption particle', ar: 'حرف استئناف' },
  RES: { en: 'Restriction particle', ar: 'أداة حصر' },
  RET: { en: 'Retraction particle', ar: 'حرف إضراب' },
  RSLT: { en: 'Result particle', ar: 'حرف واقع في جواب الشرط' },
  SUP: { en: 'Supplemental particle', ar: 'حرف زائد' },
  SUR: { en: 'Surprise particle', ar: 'حرف فجاءة' },
  VOC: { en: 'Vocative particle', ar: 'حرف نداء' },
  // Quranic initials (disconnected letters)
  INL: { en: 'Quranic initials', ar: 'حروف مقطعة' },
};

// `raw`-list feature tags → labels. Person/gender/number, aspect, voice,
// derivation, verb form, state, plus the standalone plural/vocative markers.
export const FEATURE_LABELS: Record<string, string> = {
  // Person / gender / number
  '1S': '1st person singular',
  '1P': '1st person plural',
  '2MS': '2nd person masculine singular',
  '2FS': '2nd person feminine singular',
  '2MD': '2nd person masculine dual',
  '2FD': '2nd person feminine dual',
  '2D': '2nd person dual',
  '2MP': '2nd person masculine plural',
  '2FP': '2nd person feminine plural',
  '3MS': '3rd person masculine singular',
  '3FS': '3rd person feminine singular',
  '3MD': '3rd person masculine dual',
  '3FD': '3rd person feminine dual',
  '3D': '3rd person dual',
  '3MP': '3rd person masculine plural',
  '3FP': '3rd person feminine plural',
  MS: 'Masculine singular',
  FS: 'Feminine singular',
  MD: 'Masculine dual',
  FD: 'Feminine dual',
  MP: 'Masculine plural',
  FP: 'Feminine plural',
  P: 'Plural',
  // Aspect
  PERF: 'Perfect',
  IMPF: 'Imperfect',
  IMPV: 'Imperative',
  // Voice
  ACT: 'Active voice',
  PASS: 'Passive voice',
  // Derivation
  PCPL: 'Participle',
  VN: 'Verbal noun',
  // State
  INDEF: 'Indefinite',
  // Vocative marker
  '+VOC': 'Vocative',
  // Verb forms
  '(I)': 'Form I',
  '(II)': 'Form II',
  '(III)': 'Form III',
  '(IV)': 'Form IV',
  '(V)': 'Form V',
  '(VI)': 'Form VI',
  '(VII)': 'Form VII',
  '(VIII)': 'Form VIII',
  '(IX)': 'Form IX',
  '(X)': 'Form X',
  '(XI)': 'Form XI',
  '(XII)': 'Form XII',
};

// `case`/`gender` arrive already worded from the scrape (e.g. "genitive").
// Normalize to title case for display.
export const CASE_LABELS: Record<string, string> = {
  genitive: 'Genitive',
  nominative: 'Nominative',
  accusative: 'Accusative',
};

export const GENDER_LABELS: Record<string, string> = {
  masculine: 'Masculine',
  feminine: 'Feminine',
};
