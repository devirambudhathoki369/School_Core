import { View } from 'react-native';

import { useEvents, useMe } from '@/api/queries';
import type { CalendarEvent } from '@/api/types';
import { bsShort, bsToday, monthName } from '@/lib/format';
import { Card, Divider, Empty, Failed, Loading, Screen, SectionLabel, T } from '@/ui/kit';
import { space, usePalette } from '@/ui/theme';

export default function Calendar() {
  const { me, isLoading, error, refetch } = useMe();
  const query = useEvents(me);
  const today = bsToday();

  if (isLoading) return <Screen edges={[]}><Loading /></Screen>;
  if (!me) return <Screen edges={[]}><Failed error={error} onRetry={() => refetch()} /></Screen>;

  const events = query.data?.results ?? [];
  const upcoming = events
    .filter((e) => (e.end_date ?? e.start_date) >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const earlier = events
    .filter((e) => (e.end_date ?? e.start_date) < today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));

  return (
    <Screen edges={[]} onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <Failed error={query.error} onRetry={() => query.refetch()} />
      ) : events.length === 0 ? (
        <Empty icon="calendar" title="Nothing on the calendar" body="Holidays, exams and events appear here." />
      ) : (
        <>
          <Group title="Coming up" events={upcoming} empty="Nothing else is planned yet." />
          {earlier.length ? <Group title="Earlier" events={earlier} /> : null}
        </>
      )}
    </Screen>
  );
}

function Group({ title, events, empty }: { title: string; events: CalendarEvent[]; empty?: string }) {
  // Split by BS month so a long list reads like a calendar.
  const months: [string, CalendarEvent[]][] = [];
  for (const e of events) {
    const key = e.start_date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last[0] === key) last[1].push(e);
    else months.push([key, [e]]);
  }
  return (
    <>
      <SectionLabel>{title}</SectionLabel>
      {events.length === 0 ? (
        <Card>
          <T tone="muted">{empty ?? ''}</T>
        </Card>
      ) : (
        months.map(([key, list]) => (
          <Card key={key}>
            <T v="smallStrong" tone="brand">{`${monthName(key.slice(5, 7))} ${key.slice(0, 4)}`}</T>
            {list.map((e, i) => (
              <View key={e.id} style={{ gap: space.md }}>
                {i ? <Divider /> : null}
                <Event event={e} />
              </View>
            ))}
          </Card>
        ))
      )}
    </>
  );
}

function Event({ event }: { event: CalendarEvent }) {
  const c = usePalette();
  const range =
    event.end_date && event.end_date !== event.start_date
      ? `${bsShort(event.start_date)} to ${bsShort(event.end_date)}`
      : bsShort(event.start_date);
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <View style={{ width: 4, borderRadius: 2, backgroundColor: event.color_code || c.brand }} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyStrong">{event.description}</T>
        <T v="small" tone="muted">
          {[range, event.type_str].filter(Boolean).join(' · ')}
        </T>
      </View>
    </View>
  );
}
