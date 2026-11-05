import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { font, usePalette } from '@/ui/theme';

type Icon = keyof typeof Feather.glyphMap;

function icon(name: Icon) {
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Feather name={name} size={size - 2} color={typeof color === 'string' ? color : undefined} />;
  };
}

export default function TabLayout() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.inkMuted,
        // Tall enough for the icon and a label in this font, plus the
        // home-indicator inset; the default bar clipped the labels.
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.line,
          height: 66 + insets.bottom,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance', tabBarIcon: icon('calendar') }} />
      <Tabs.Screen name="fees" options={{ title: 'Fees', tabBarIcon: icon('credit-card') }} />
      <Tabs.Screen name="homework" options={{ title: 'Homework', tabBarIcon: icon('book-open') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('grid') }} />
    </Tabs>
  );
}
