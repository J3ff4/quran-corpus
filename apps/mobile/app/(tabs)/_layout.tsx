import { Tabs } from 'expo-router';
import { GlassTabBar } from '@/components/GlassTabBar';

export default function TabsLayout() {
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
        sceneStyle: { backgroundColor: 'transparent' },
      }}
    >
      {/* Titles and icons live in GlassTabBar's own TABS map -- one place, not
          two. The screens are still listed so the navigator's route order is
          declared here rather than inferred from the filesystem. */}
      <Tabs.Screen name="index" />
      <Tabs.Screen name="surahs" />
      <Tabs.Screen name="morphology" />
      <Tabs.Screen name="dictionary" />
      <Tabs.Screen name="menu" />
    </Tabs>
  );
}
