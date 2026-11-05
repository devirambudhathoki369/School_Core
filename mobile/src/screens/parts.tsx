import { type Href, router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useActive } from '@/accounts/store';
import { ApiError } from '@/api/client';
import { bsLong, bsToday, bsWeekday } from '@/lib/format';
import { font, space, usePalette } from '@/theme';
import { Banner, Header, T } from '@/ui/kit';
import { initials } from '@/ui/SchoolCard';

const WEEKDAY: Record<string, string> = {
  Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday',
};

/** The navy header of a home screen: school, person, today's date. */
export function HomeHeader({ name, sub, school }: { name: string; sub: string; school: string }) {
  const c = usePalette();
  const account = useActive();
  const today = bsToday();
  return (
    <Header>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Pressable
          onPress={() => router.navigate(`/${account.role}/more` as Href)}
          accessibilityRole="button"
          accessibilityLabel="Your account"
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: c.marigold,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <T style={{ fontFamily: font.heavy, fontSize: 18, color: c.onMarigold }}>{initials(name) || '?'}</T>
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          {school !== name ? (
            <T v="small" tone="onHeaderSoft" numberOfLines={1}>
              {school}
            </T>
          ) : null}
          <T v="title" tone="onHeader" numberOfLines={1}>
            {name}
          </T>
          <T v="small" tone="onHeaderSoft" numberOfLines={1}>
            {sub}
          </T>
        </View>
      </View>
      <T v="smallStrong" style={{ color: c.marigold, letterSpacing: 0.3 }}>
        {`${WEEKDAY[bsWeekday(today)] ?? ''}, ${bsLong(today)}`}
      </T>
    </Header>
  );
}

function clock(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "Updated 10:42", or the offline note when the last refresh failed. */
export function Freshness({ updatedAt, error }: { updatedAt: number; error: unknown }) {
  if (!updatedAt) return null;
  if (error instanceof ApiError && error.status === 0) {
    return <Banner tone="warn">{`Offline. Showing what was saved at ${clock(updatedAt)}.`}</Banner>;
  }
  return (
    <T v="small" tone="quiet">
      {`Updated ${clock(updatedAt)}`}
    </T>
  );
}
