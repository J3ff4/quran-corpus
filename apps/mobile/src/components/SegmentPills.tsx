import { Text, View } from 'react-native';
import type { WordSegment } from '@quran-corpus/data/mobile';

import { colors } from '@/theme/tokens';

export function SegmentPills({ segments }: { segments: WordSegment[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {segments.map((segment) => (
        <View
          key={segment.id}
          style={{ borderRadius: 999, backgroundColor: '#ede6d8', paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <Text style={{ color: colors.ink }}>
            {segment.pos_tag ?? segment.segment_type ?? 'segment'}
          </Text>
        </View>
      ))}
    </View>
  );
}
