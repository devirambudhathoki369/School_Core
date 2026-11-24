import { RoleShell } from '@/ui/RoleTabs';

// A screen opened straight from a link still has the tabs under it.
export const unstable_settings = { anchor: '(tabs)' };

/** The staff's screens: the tabs, the screens opened from them, and the bar under all of them. */
export default function Layout() {
  return <RoleShell role="staff" />;
}
