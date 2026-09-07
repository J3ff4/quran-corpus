/**
 * M7a spike route. Dev-only, deleted before the phase's PR merges, and
 * deliberately unreachable: no tab, no Link, reached only by typing the path.
 *
 * It answers four questions and nothing else:
 *  1. does expo-font's runtime `loadAsync` register a font that was never in
 *     the static manifest?
 *  2. do WOFF2 and TTF both work on RN Android?
 *  3. does per-word tinting break shaping in QCF glyph text?
 *  4. does it break shaping in the Unicode fallback text? (expected: yes)
 *
 * Everything here is throwaway: no theme tokens, no i18n, no accessibility
 * work. Do not copy this file into M7b.
 */
import * as Font from 'expo-font';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import layout from '../assets/fonts/spike/layout.json';

type Edition = 'v1' | 'v2';
type Format = 'woff2' | 'ttf';
type SpikePage = 2 | 106 | 604;

type LayoutWord = { code: string; key: string; text: string };
type LayoutLine = { line: number; words: LayoutWord[] };
type LayoutFile = Record<string, Partial<Record<Edition, LayoutLine[]>>>;

const PAGES: SpikePage[] = [2, 106, 604];
const EDITIONS: Edition[] = ['v1', 'v2'];
const FORMATS: Format[] = ['woff2', 'ttf'];

// Metro needs a literal path per require, so the twelve spike assets are
// enumerated rather than built from a template.
const ASSETS: Record<Edition, Record<Format, Record<SpikePage, number>>> = {
  v1: {
    woff2: {
      2: require('../assets/fonts/spike/v1/woff2/p2.woff2'),
      106: require('../assets/fonts/spike/v1/woff2/p106.woff2'),
      604: require('../assets/fonts/spike/v1/woff2/p604.woff2'),
    },
    ttf: {
      2: require('../assets/fonts/spike/v1/ttf/p2.ttf'),
      106: require('../assets/fonts/spike/v1/ttf/p106.ttf'),
      604: require('../assets/fonts/spike/v1/ttf/p604.ttf'),
    },
  },
  v2: {
    woff2: {
      2: require('../assets/fonts/spike/v2/woff2/p2.woff2'),
      106: require('../assets/fonts/spike/v2/woff2/p106.woff2'),
      604: require('../assets/fonts/spike/v2/woff2/p604.woff2'),
    },
    ttf: {
      2: require('../assets/fonts/spike/v2/ttf/p2.ttf'),
      106: require('../assets/fonts/spike/v2/ttf/p106.ttf'),
      604: require('../assets/fonts/spike/v2/ttf/p604.ttf'),
    },
  },
};

/** The family name each spike asset registers under. Kept distinct per format
 *  so loading the TTF cannot be mistaken for the WOFF2 already succeeding. */
function familyOf(edition: Edition, format: Format, page: SpikePage): string {
  return `spike_${edition}_${format}_p${page}`;
}

export default function MushafSpike() {
  const [edition, setEdition] = useState<Edition>('v2');
  const [format, setFormat] = useState<Format>('woff2');
  const [page, setPage] = useState<SpikePage>(2);
  const [loaded, setLoaded] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [tinted, setTinted] = useState(false);

  const family = familyOf(edition, format, page);
  const ms = loaded[family];

  const load = useCallback(async () => {
    setError(null);
    const started = Date.now();
    try {
      await Font.loadAsync({ [family]: ASSETS[edition][format][page] });
      setLoaded((prev) => ({ ...prev, [family]: Date.now() - started }));
    } catch (e) {
      setError(String(e));
    }
  }, [edition, family, format, page]);

  const lines = useMemo<LayoutLine[]>(
    () => (layout as LayoutFile)[String(page)]?.[edition] ?? [],
    [edition, page],
  );

  const glyphStyle = { fontFamily: ms === undefined ? undefined : family };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Row label="edition" values={EDITIONS} value={edition} onPick={setEdition} />
      <Row label="format" values={FORMATS} value={format} onPick={setFormat} />
      <Row label="page" values={PAGES} value={page} onPick={setPage} />

      <Pressable style={styles.button} onPress={load}>
        <Text style={styles.buttonText}>
          {ms === undefined ? `load ${family}` : `loaded in ${ms}ms — reload`}
        </Text>
      </Pressable>
      <Pressable style={styles.button} onPress={() => setTinted((t) => !t)}>
        <Text style={styles.buttonText}>per-word tint: {tinted ? 'on' : 'off'}</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.note}>
        {ms === undefined
          ? 'not loaded — glyphs below will be tofu until you load'
          : `registered as ${family}`}
      </Text>

      <View style={styles.page}>
        {lines.map((line) => (
          <Text key={line.line} style={[styles.glyphLine, glyphStyle]}>
            {tinted
              ? line.words.map((w, i) => (
                  <Text key={i} style={{ color: i % 2 ? '#1f6f5b' : '#1f1a14' }}>
                    {w.code}
                  </Text>
                ))
              : line.words.map((w) => w.code).join('')}
          </Text>
        ))}
      </View>

      <Text style={styles.note}>
        Above: {lines.length} lines. If they do not reach both margins, the page
        font is not applied and runtime registration is a false positive.
      </Text>

      {/* The Unicode fallback is live Arabic, not pre-shaped glyphs, so nesting
          a Text per word is expected to break its joining on Android. Rendering
          it here tells M7c whether the fallback may be tinted at all. */}
      <Text style={styles.note}>Unicode fallback, same line, one Text:</Text>
      <Text style={styles.fallback}>
        {(lines[0]?.words ?? []).map((w) => w.text).join(' ')}
      </Text>
      <Text style={styles.note}>Unicode fallback, one Text per word:</Text>
      <Text style={styles.fallback}>
        {(lines[0]?.words ?? []).map((w, i) => (
          <Text key={i} style={{ color: i % 2 ? '#1f6f5b' : '#1f1a14' }}>
            {w.text}{' '}
          </Text>
        ))}
      </Text>
    </ScrollView>
  );
}

function Row<T extends string | number>({
  label,
  values,
  value,
  onPick,
}: {
  label: string;
  values: readonly T[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {values.map((v) => (
        <Pressable
          key={String(v)}
          onPress={() => onPick(v)}
          style={[styles.chip, v === value && styles.chipOn]}
        >
          <Text style={v === value ? styles.chipTextOn : styles.chipText}>{String(v)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#faf8f3' },
  content: { padding: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowLabel: { width: 56, fontSize: 12, color: '#7b7165' },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: '#ded6c9' },
  chipOn: { backgroundColor: '#1f6f5b', borderColor: '#1f6f5b' },
  chipText: { color: '#1f1a14', fontSize: 12 },
  chipTextOn: { color: '#faf8f3', fontSize: 12 },
  button: { padding: 10, borderRadius: 8, backgroundColor: '#1f1a14' },
  buttonText: { color: '#faf8f3', textAlign: 'center', fontSize: 13 },
  error: { color: '#b3261e', fontSize: 12 },
  note: { fontSize: 11, color: '#7b7165' },
  page: { paddingVertical: 12, gap: 2 },
  // No letter-spacing, no stretching, no justification: the premise is that the
  // page font already fits the line, so any fitting we add would hide a failure.
  glyphLine: { fontSize: 26, lineHeight: 46, textAlign: 'center', color: '#1f1a14' },
  fallback: { fontSize: 22, lineHeight: 44, textAlign: 'center', color: '#1f1a14', writingDirection: 'rtl' },
});
