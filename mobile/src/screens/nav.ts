import { type Href, router } from 'expo-router';

import { useActive } from '@/accounts/store';

/** Opens a screen of the signed-in role: go('/receipt/12') → /parent/receipt/12. */
export function useGo() {
  const { role } = useActive();
  return (path: string) => router.push(`/${role}${path}` as Href);
}

export function back() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
