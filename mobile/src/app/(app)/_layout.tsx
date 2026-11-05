import { Stack } from 'expo-router';

import { font, usePalette } from '@/ui/theme';

export const unstable_settings = { anchor: '(tabs)' };

export default function AppLayout() {
  const c = usePalette();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.brandInk,
        headerTitleStyle: { fontFamily: font.semibold, color: c.ink },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: c.canvas },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="results" options={{ title: 'Exam results' }} />
      <Stack.Screen name="notices" options={{ title: 'Notices' }} />
      <Stack.Screen name="calendar" options={{ title: 'School calendar' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="receipt/[id]" options={{ title: 'Receipt' }} />
    </Stack>
  );
}
