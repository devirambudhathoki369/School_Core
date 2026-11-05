import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { font, usePalette } from '@/theme';
import { Icon, type IconName } from './Icon';

function tabIcon(name: IconName) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <TabGlyph name={name} color={typeof color === 'string' ? color : undefined} focused={focused} />;
  };
}

function TabGlyph({ name, color, focused }: { name: IconName; color?: string; focused: boolean }) {
  const c = usePalette();
  return (
    <View
      style={{
        width: 56,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? c.blueTint : 'transparent',
      }}>
      <Icon name={name} size={22} color={color ?? c.textQuiet} filled={focused} />
    </View>
  );
}

/** The bottom bar of a role's screens. Sized from the safe area, so the
 *  labels are never clipped under the home indicator. */
export default function RoleTabs() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.blueText,
        tabBarInactiveTintColor: c.textQuiet,
        tabBarStyle: {
          backgroundColor: c.card,
          borderTopColor: c.line,
          height: 68 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14 },
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen name="more" options={{ title: 'Account', tabBarIcon: tabIcon('grid') }} />
    </Tabs>
  );
}
