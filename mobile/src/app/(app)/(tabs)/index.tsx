import { router } from 'expo-router';
import { View } from 'react-native';

import { useAttendance, useDues, useEvents, useHomework, useMe, useNotices } from '@/api/queries';
import { bsLong, bsShort, bsThisMonth, bsToday, bsWeekday, clock, daysBetween, money, titleCase } from '@/lib/format';
import { Card, Failed, Loading, Pill, Screen, SectionLabel, T } from '@/ui/kit';
import { space } from '@/ui/theme';

export default function Home() {
  const { me, isLoading, error, refetch } = useMe();
  const today = bsToday();
  const attendance = useAttendance(bsThisMonth());
  const dues = useDues(me);
  const homework = useHomework(me);
  const notices = useNotices(me);
  const events = useEvents(me);

  const refreshing = attendance.isRefetching || dues.isRefetching || homework.isRefetching;
  const refresh = () => {
    void refetch();
    void attendance.refetch();
    void dues.refetch();
    void homework.refetch();
    void notices.refetch();
    void events.refetch();
  };

  if (isLoading) return <Screen><Loading /></Screen>;
  if (!me) return <Screen><Failed error={error} onRetry={refresh} /></Screen>;

  const todayRecord = attendance.data?.data.find((d) => d.date === today);
  const weekday = bsWeekday(today);
  const open = (homework.data ?? []).filter((h) => (daysBetween(today, h.due_date) ?? -1) >= 0);
  const nextDue = [...open].sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const latest = notices.data?.results?.[0];
  const upcoming = (events.data?.results ?? [])
    .filter((e) => (e.end_date ?? e.start_date) >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, 2);
  const roll = me.record?.roll_no;

  return (
    <Screen onRefresh={refresh} refreshing={refreshing}>
      <View style={{ gap: 2 }}>
        <T v="small" tone="muted" numberOfLines={1}>
          {me.profile.school_name}
        </T>
        <T v="title">{titleCase(me.profile.name)}</T>
        <T tone="soft">{[me.className, roll ? `Roll ${roll}` : null].filter(Boolean).join(' · ')}</T>
      </View>

      <Card onPress={() => router.navigate('/attendance')} accessibilityLabel="Today's attendance">
        <SectionLabel>Today</SectionLabel>
        <T v="subheading">
          {weekday ? `${weekday}, ` : ''}
          {bsLong(today)}
        </T>
        {attendance.isLoading ? (
          <T tone="muted">Checking attendance…</T>
        ) : todayRecord ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Pill tone={todayRecord.status ? 'ok' : 'bad'}>{todayRecord.status ? 'Present' : 'Absent'}</Pill>
            {todayRecord.checked_in_at ? (
              <T v="small" tone="muted">
                In at {clock(todayRecord.checked_in_at)}
                {todayRecord.checked_out_at ? `, out at ${clock(todayRecord.checked_out_at)}` : ''}
              </T>
            ) : null}
          </View>
        ) : (
          <Pill tone="off">{weekday === 'Sat' ? 'Saturday, no school' : 'Not marked yet'}</Pill>
        )}
      </Card>

      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Card style={{ flex: 1 }} onPress={() => router.navigate('/fees')} accessibilityLabel="Fees due">
          <T v="label" tone="muted" style={{ textTransform: 'uppercase' }}>
            Fees due
          </T>
          {dues.isLoading ? (
            <T tone="muted">…</T>
          ) : dues.error ? (
            <T v="small" tone="muted">Not available</T>
          ) : (
            <>
              <T v="heading" tone={(dues.data?.total ?? 0) > 0 ? 'ink' : 'ok'}>
                {(dues.data?.total ?? 0) > 0 ? money(dues.data?.total) : 'Paid up'}
              </T>
              <T v="small" tone="muted">
                {(dues.data?.total ?? 0) > 0 ? 'See what it covers' : 'Nothing due now'}
              </T>
            </>
          )}
        </Card>
        <Card style={{ flex: 1 }} onPress={() => router.navigate('/homework')} accessibilityLabel="Homework">
          <T v="label" tone="muted" style={{ textTransform: 'uppercase' }}>
            Homework
          </T>
          {homework.isLoading ? (
            <T tone="muted">…</T>
          ) : (
            <>
              <T v="heading">{open.length ? `${open.length} open` : 'All done'}</T>
              <T v="small" tone="muted" numberOfLines={1}>
                {nextDue ? `Next due ${bsShort(nextDue.due_date)}` : 'Nothing due'}
              </T>
            </>
          )}
        </Card>
      </View>

      {latest ? (
        <>
          <SectionLabel>Latest notice</SectionLabel>
          <Card onPress={() => router.push('/notices')} accessibilityLabel="Latest notice">
            <View style={{ gap: space.xs }}>
              <T v="small" tone="muted">
                {bsLong(latest.date)}
              </T>
              <T v="bodyStrong">{latest.title}</T>
              {latest.description ? (
                <T tone="soft" numberOfLines={2}>
                  {latest.description}
                </T>
              ) : null}
            </View>
          </Card>
        </>
      ) : null}

      {upcoming.length ? (
        <>
          <SectionLabel>Coming up</SectionLabel>
          <Card onPress={() => router.push('/calendar')} accessibilityLabel="Coming up">
            {upcoming.map((e) => (
              <View key={e.id} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
                <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: e.color_code || '#037177' }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bodyStrong">{e.description}</T>
                  <T v="small" tone="muted">
                    {bsShort(e.start_date)}
                    {e.end_date && e.end_date !== e.start_date ? ` to ${bsShort(e.end_date)}` : ''}
                  </T>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
