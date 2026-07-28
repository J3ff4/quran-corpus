import type BottomSheet from '@gorhom/bottom-sheet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { createExpoSqliteClient, type ExpoSqliteLike } from '@quran-corpus/mobile-data';

import {
  getM0SurahReader,
  getM0WordDetail,
  type MobileWordDetail,
  type SurahReaderData,
} from '@/data/corpusRepository';
import { openCorpusDb } from '@/data/openCorpusDb';
import { contentLanguages, type ContentLanguageCode } from '@/i18n/languages';
import { colors } from '@/theme/tokens';

import { WordDetailSheet } from './WordDetailSheet';

function createCorpusClient(db: ExpoSqliteLike) {
  return createExpoSqliteClient(db);
}

export function ReaderScreen() {
  const [language, setLanguage] = useState<ContentLanguageCode>('en');
  const [data, setData] = useState<SurahReaderData | null>(null);
  const [wordDetail, setWordDetail] = useState<MobileWordDetail | null>(null);
  const sheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const db = await openCorpusDb();
      const client = createCorpusClient(db as ExpoSqliteLike);
      const reader = await getM0SurahReader(client, language);
      if (!cancelled) setData(reader);
    }

    load().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [language]);

  const selectedLanguage = useMemo(
    () => contentLanguages.find((item) => item.code === language) ?? contentLanguages[0],
    [language],
  );

  async function selectWord(wordId: number) {
    const db = await openCorpusDb();
    const client = createCorpusClient(db as ExpoSqliteLike);
    setWordDetail(await getM0WordDetail(client, wordId));
    sheetRef.current?.snapToIndex(0);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }}>
        <Text style={{ color: colors.muted }}>Quran Corpus M0</Text>
        <Text style={{ fontFamily: 'Hafs', fontSize: 48, color: colors.ink, textAlign: 'right' }}>الفاتحة</Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {contentLanguages.map((item) => (
            <Pressable
              key={item.code}
              onPress={() => setLanguage(item.code)}
              style={{
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 8,
                backgroundColor: item.code === language ? colors.accent : '#ede6d8',
              }}
            >
              <Text style={{ color: item.code === language ? 'white' : colors.ink }}>{item.nativeLabel}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ color: colors.muted }}>Translation: {selectedLanguage?.label ?? 'English'}</Text>

        {data?.ayahs.map(({ ayah, translation, words }) => (
          <View key={ayah.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8 }}>
              {words.map((word) => (
                <Pressable key={word.id} onPress={() => selectWord(word.id)}>
                  <Text style={{ fontFamily: 'Hafs', fontSize: 34, color: colors.ink }}>{word.text_arabic}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ color: colors.ink }}>{translation?.text}</Text>
          </View>
        ))}
      </ScrollView>
      <WordDetailSheet ref={sheetRef} wordDetail={wordDetail} />
    </View>
  );
}
