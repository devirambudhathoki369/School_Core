import { Stack } from 'expo-router';

import { usePalette } from '@/theme';

/** The admin's screens: the tabs, and the screens opened from them. */
export default function Layout() {
  const c = usePalette();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.page } }} />;
}
