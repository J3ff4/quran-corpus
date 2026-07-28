import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { forwardRef } from 'react';
import { Text, View } from 'react-native';

import type { MobileWordDetail } from '@/data/corpusRepository';
import { colors } from '@/theme/tokens';

import { SegmentPills } from './SegmentPills';

export const WordDetailSheet = forwardRef<BottomSheet, { wordDetail: MobileWordDetail | null }>(
  function WordDetailSheet({ wordDetail }, ref) {
    return (
      <BottomSheet ref={ref} index={-1} snapPoints={['45%', '80%']} enablePanDownToClose>
        <BottomSheetScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
          {!wordDetail?.detail ? (
            <Text>No word selected.</Text>
          ) : (
            <View style={{ gap: 12 }}>
              <Text style={{ fontFamily: 'Hafs', fontSize: 42, color: colors.ink, textAlign: 'right' }}>
                {wordDetail.detail.word.text_arabic}
              </Text>
              <Text style={{ fontSize: 18, color: colors.ink }}>{wordDetail.detail.word.transliteration}</Text>
              <Text style={{ color: colors.muted }}>{wordDetail.detail.word.morphology_description}</Text>
              <SegmentPills segments={wordDetail.segments} />
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    );
  },
);
