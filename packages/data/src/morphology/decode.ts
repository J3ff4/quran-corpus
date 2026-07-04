import type { WordSegment, DecodedSegment, DecodedFeature } from '../types.js';
import { buckwalterToArabic } from '../text/arabic.js';
import { POS_LABELS, FEATURE_LABELS, CASE_LABELS, GENDER_LABELS } from './tags.js';

type Features = { case?: string; gender?: string; raw?: string[] };

function parseFeatures(json: string | null): Features {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Features;
    }
  } catch {
    // malformed → no features (spec: tolerant, never throw)
  }
  return {};
}

/**
 * Decode one raw `WordSegment` into display-ready structured grammar.
 * Pure and deterministic. Unknown codes/tags degrade to the raw value
 * (POS → raw code as `en`; raw feature tag → `unknownTags`) — never throws,
 * never hides.
 */
export function decodeSegment(segment: WordSegment): DecodedSegment {
  const role: DecodedSegment['role'] =
    segment.segment_type === 'prefix' || segment.segment_type === 'suffix'
      ? segment.segment_type
      : 'stem';

  const code = segment.pos_tag ?? '';
  const label = POS_LABELS[code];
  const pos: DecodedSegment['pos'] = { code, en: label?.en ?? (code || '?') };
  if (label?.ar) pos.ar = label.ar;

  const features: DecodedFeature[] = [];
  const unknownTags: string[] = [];
  const f = parseFeatures(segment.features_json);

  if (f.case) features.push({ key: 'case', label: 'Case', value: CASE_LABELS[f.case] ?? f.case });
  if (f.gender)
    features.push({ key: 'gender', label: 'Gender', value: GENDER_LABELS[f.gender] ?? f.gender });
  if (Array.isArray(f.raw)) {
    for (const tag of f.raw) {
      const human = FEATURE_LABELS[tag];
      if (human) features.push({ key: 'feature', label: '', value: human });
      else unknownTags.push(tag);
    }
  }

  const decoded: DecodedSegment = { role, pos, features, unknownTags };
  if (segment.root) decoded.rootArabic = buckwalterToArabic(segment.root);
  if (segment.lemma) decoded.lemma = segment.lemma;
  return decoded;
}
