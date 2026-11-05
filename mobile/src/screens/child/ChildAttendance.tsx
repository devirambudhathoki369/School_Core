import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useApi } from '@/api/hooks';
import type { AttendanceMonth } from '@/api/types';
import { bsShort, bsToday, clock } from '@/lib/format';
import { space, usePalette } from '@/theme';
import { Icon } from '@/ui/Icon';
import { Card, Divider, ListRow, Screen, SectionLabel, T } from '@/ui/kit';
import { Chip, Loaded, MonthGrid, Row, Tile } from '@/ui/parts';
import { Freshness, PageHeader } from '../parts';
import { useChild } from './context';

/** A month of attendance: a calendar, the totals, and the days missed. */
export function AttendanceMonthView({
  path,
  title,
  sub,
  onBack,
}: {
  /** The endpoint, without ?month= */
  path: string | null;
  title: string;
  sub?: string;
  onBack?: (() => void) | null;
}) {
  const c = usePalette();
  const [month, setMonth] = useState<string | undefined>();
  const query = useApi<AttendanceMonth>(path ? `${path}${month ? `?month=${month}` : ''}` : null);
  const shown = query.data?.month;
  const thisMonth = bsToday().slice(0, 7);

  return (
    <Screen
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      header={<PageHeader title={title} sub={sub} onBack={onBack} />}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          onPress={() => shown && setMonth(shown.previous)}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={10}>
          <Icon name="chevron-left" size={24} color={c.blueText} />
        </Pressable>
        <T v="heading">{shown?.label ?? ' '}</T>
        <Pressable
          onPress={() => shown && shown.month < thisMonth && setMonth(shown.next)}
          disabled={!shown || shown.month >= thisMonth}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={10}
          style={{ opacity: !shown || shown.month >= thisMonth ? 0.3 : 1 }}>
          <Icon name="chevron-right" size={24} color={c.blueText} />
        </Pressable>
      </Card>
      <Loaded query={query}>
        {(data) => {
          const absent = data.days.filter((d) => d.status === 'absent');
          return (
            <>
              <Freshness updatedAt={query.dataUpdatedAt} error={query.error} />
              <Row>
                <Tile label="Present" value={String(data.totals.present)} tone="ok" />
                <Tile label="Absent" value={String(data.totals.absent)} tone={data.totals.absent ? 'bad' : 'quiet'} />
                <Tile label="Days taken" value={String(data.totals.taken)} />
              </Row>
              <Card>
                <MonthGrid
                  days={data.month.days}
                  startsOn={data.month.starts_on}
                  marks={data.days}
                  monthKey={data.month.month}
                  today={bsToday()}
                />
                <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                  <Chip label="Present" tone="ok" />
                  <Chip label="Absent" tone="bad" />
                  <Chip label="Not taken" />
                </View>
              </Card>
              {absent.length ? (
                <>
                  <SectionLabel>Days absent</SectionLabel>
                  <Card padded={false}>
                    {absent.map((day, i) => (
                      <View key={day.date}>
                        {i ? <Divider inset={70} /> : null}
                        <ListRow icon="x" tint="bad" title={bsShort(day.date)} />
                      </View>
                    ))}
                  </Card>
                </>
              ) : null}
              {data.days.some((d) => d.checked_in_at) ? (
                <>
                  <SectionLabel>Card reader times</SectionLabel>
                  <Card padded={false}>
                    {data.days
                      .filter((d) => d.checked_in_at)
                      .reverse()
                      .map((day, i) => (
                        <View key={day.date}>
                          {i ? <Divider inset={70} /> : null}
                          <ListRow
                            icon="clock"
                            tint="ok"
                            title={bsShort(day.date)}
                            sub={`In ${clock(day.checked_in_at)}${day.checked_out_at ? ` · out ${clock(day.checked_out_at)}` : ''}`}
                          />
                        </View>
                      ))}
                  </Card>
                </>
              ) : null}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}

export function ChildAttendance({ root }: { root?: boolean }) {
  const { child } = useChild();
  return (
    <AttendanceMonthView
      path={child ? `students/${child.id}/attendance` : null}
      title="Attendance"
      sub={child?.name}
      onBack={root ? null : undefined}
    />
  );
}
