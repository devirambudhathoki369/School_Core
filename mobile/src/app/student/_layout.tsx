import { Stack } from 'expo-router';

import { ChildProvider } from '@/screens/child/context';
import { usePalette } from '@/theme';

/** The student's screens: the tabs, and the screens opened from them. */
export default function Layout() {
  const c = usePalette();
  return (
    <ChildProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.page } }} />
    </ChildProvider>
  );
}
