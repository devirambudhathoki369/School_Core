import { type Href, router, Stack, Tabs, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Role } from '@/api/types';
import { font, usePalette } from '@/theme';
import { Icon, type IconName } from './Icon';
import { tabReselected } from './reselect';

export type TabSpec = { name: string; title: string; icon: IconName };

/** Each role's bottom bar. `index` is the role's home. */
export const ROLE_TABS: Record<Role, TabSpec[]> = {
  student: [
    { name: 'index', title: 'Home', icon: 'home' },
    { name: 'attendance', title: 'Attendance', icon: 'calendar' },
    { name: 'homework', title: 'Homework', icon: 'book' },
    { name: 'results', title: 'Results', icon: 'award' },
    { name: 'more', title: 'Account', icon: 'grid' },
  ],
  parent: [
    { name: 'index', title: 'Home', icon: 'home' },
    { name: 'attendance', title: 'Attendance', icon: 'calendar' },
    { name: 'fees', title: 'Fees', icon: 'wallet' },
    { name: 'homework', title: 'Homework', icon: 'book' },
    { name: 'more', title: 'Account', icon: 'grid' },
  ],
  staff: [
    { name: 'index', title: 'Today', icon: 'sun' },
    { name: 'classes', title: 'Classes', icon: 'users' },
    { name: 'homework', title: 'Homework', icon: 'book' },
    { name: 'notices', title: 'Notices', icon: 'bell' },
    { name: 'more', title: 'Account', icon: 'grid' },
  ],
  admin: [
    { name: 'index', title: 'Today', icon: 'chart' },
    { name: 'students', title: 'Students', icon: 'student' },
    { name: 'fees', title: 'Fees', icon: 'wallet' },
    { name: 'staff', title: 'Staff', icon: 'staff' },
    { name: 'more', title: 'Account', icon: 'grid' },
  ],
};

/** "/student" for the home tab, "/student/homework" for another. */
export function tabPath(role: Role, name: string) {
  return name === 'index' ? `/${role}` : `/${role}/${name}`;
}

/** The tab whose own screen this path is, if it is one. */
export function tabAt(role: Role, path: string) {
  return ROLE_TABS[role].find((tab) => tabPath(role, tab.name) === path);
}

/** Opens a tab from anywhere in the role's screens: the screens opened on
 *  top of the tabs close, so Back never leads to a second copy of them. */
export function openTab(role: Role, name: string) {
  const href = tabPath(role, name) as Href;
  // dismissTo does nothing when no screen is open over the tabs
  if (router.canDismiss()) router.dismissTo(href);
  else router.navigate(href);
}

/** The tabs themselves. Their bar is drawn by RoleShell instead, so it also
 *  stays under the screens opened from a tab. */
export function RoleTabs({ role }: { role: Role }) {
  return (
    <Tabs tabBar={() => null} screenOptions={{ headerShown: false }}>
      {ROLE_TABS[role].map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}

/** A role's screens with the bottom bar under all of them: the tabs, and
 *  every screen opened from a tab. */
export function RoleShell({ role }: { role: Role }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardOpen();
  // The bar takes the bottom inset, so the screens above it must not add it again.
  const screenInsets = { ...insets, bottom: keyboard ? insets.bottom : 0 };
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <SafeAreaInsetsContext.Provider value={screenInsets}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.page } }} />
      </SafeAreaInsetsContext.Provider>
      {keyboard ? null : <RoleBar role={role} />}
    </View>
  );
}

/** Android shrinks the window for the keyboard, which would lift the bar
 *  onto it; iOS draws the keyboard over the bar, so there it can stay. */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const shown = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return open;
}

function RoleBar({ role }: { role: Role }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const tabs = ROLE_TABS[role];
  const own = tabAt(role, path);
  // On a screen opened from a tab, that tab stays lit: the last one shown,
  // unless the path itself sits under a tab (/student/homework/12).
  const [last, setLast] = useState(tabs[0].name);
  if (own && own.name !== last) setLast(own.name);
  const under = tabs.find((tab) => tab.name !== 'index' && path.startsWith(`${tabPath(role, tab.name)}/`));
  const current = own?.name ?? under?.name ?? last;

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          backgroundColor: c.card,
          borderTopColor: c.line,
          height: 68 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}>
      {tabs.map((tab) => {
        const focused = tab.name === current;
        const color = focused ? c.blueText : c.textQuiet;
        return (
          <Pressable
            key={tab.name}
            onPress={() => {
              // On the tab itself: back to its top. Anywhere else: open it.
              if (own?.name === tab.name) tabReselected();
              else openTab(role, tab.name);
            }}
            accessibilityRole="tab"
            aria-selected={focused}
            accessibilityLabel={tab.title}
            style={styles.item}>
            <View style={[styles.glyph, focused && { backgroundColor: c.blueTint }]}>
              <Icon name={tab.icon} size={22} color={color} filled={focused} />
            </View>
            <Text style={[styles.label, { color }]} numberOfLines={1}>
              {tab.title}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  glyph: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14 },
});
