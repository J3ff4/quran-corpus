import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ReaderScreen } from '@/components/ReaderScreen';

export default function IndexRoute() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ReaderScreen />
    </GestureHandlerRootView>
  );
}
