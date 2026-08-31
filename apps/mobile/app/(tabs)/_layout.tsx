import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassTabBar } from '@/components/GlassTabBar';

export default function TabsLayout() {
  // The native header used to push tab content clear of the status bar. With
  // headerShown off below, nothing does -- the first row of every tab rendered
  // under the clock. Applied to the scene rather than inside the five screens
  // so there is one place to change it.
  const { top } = useSafeAreaInsets();

  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        // Each tab screen draws its own heading from M6b onward; a native
        // header above the bloom would be an opaque strip across the top of the
        // one gradient the design is built around.
        headerShown: false,
        // The bloom in app/_layout.tsx is the background for every screen. An
        // opaque scene covers it and leaves the tab pill floating over a flat
        // rectangle.
        sceneStyle: { backgroundColor: 'transparent', paddingTop: top },
      }}
    >
      {/* Titles and icons live in GlassTabBar's own TABS map -- one place, not
          two. The screens are still listed so the navigator's route order is
          declared here rather than inferred from the filesystem. */}
      <Tabs.Screen name="index" />
      {/* Mounted at launch instead of on first tap. Every other tab is cheap
          enough to build on demand; this one opens with a SQLite read, so a
          lazy mount put that read -- and the screen's own first render --
          between the tap and anything to look at, which is the blank screen
          with a spinner on it. Rendering it during startup moves the same work
          behind the splash, where the corpus DB is already being opened, and
          the browse prefetch in SurahsScreen then has the other three modes
          warm before the tab is ever opened. */}
      <Tabs.Screen name="surahs" options={{ lazy: false }} />
      <Tabs.Screen name="morphology" />
      <Tabs.Screen name="dictionary" />
      <Tabs.Screen name="menu" />
    </Tabs>
  );
}
