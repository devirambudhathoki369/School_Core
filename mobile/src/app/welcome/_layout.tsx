import { Stack } from 'expo-router';

import { usePalette } from '@/theme';

export default function WelcomeLayout() {
  const c = usePalette();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.page } }} />;
}
