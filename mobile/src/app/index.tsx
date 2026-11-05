import { type Href, Redirect } from 'expo-router';

import { useAccounts } from '@/accounts/store';
import { useLock } from '@/lock/store';

/** Sends each state to its place: welcome, the PIN set-up, or the role's home. */
export default function Index() {
  const { active, adding } = useAccounts();
  const lock = useLock();
  if (!active || adding) return <Redirect href="/welcome" />;
  if (lock.required && !lock.hasPin) return <Redirect href="/lock-setup" />;
  return <Redirect href={`/${active.role}` as Href} />;
}
