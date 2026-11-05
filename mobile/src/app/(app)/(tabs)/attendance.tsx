import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAttendance } from '@/api/queries';
import type { AttendanceDay } from '@/api/types';
import {
  type BsMonth,
  bsThisMonth,
  bsToday,
  bsWeekday,
  clock,
  daysInMonth,
  firstWeekday,
  monthLabel,
  shiftMonth,
  WEEKDAYS,
} from '@/lib/format';
import { Card, Divider, Empty, Failed, Loading, PageTitle, Row, Screen, SectionLabel, T } from '@/ui/kit';
import { radius, space, type, usePalette } from '@/ui/theme';

const pad = (n: number) => String(n).padStart(2, '0');

export default function Attendance() {
  const c = usePalette();
  const current = bsThisMonth();
  const [month, setMonth] = useState<BsMonth>(current);
  const query = useAttendance(month);
  const isCurrent = month.year === current.year && month.month === current.month;

  const days = query.data?.data ?? [];
  const byDate = new Map<string, AttendanceDay>(days.map((d) => [d.date, d]));
  const present = days.filter((d) => d.status).length;
  const absent = days.filter((d) => !d.status).length;
  const rate = present + absent ? Math.round((present / (present + absent)) * 100) : null;
  const withTimes = days.filter((d) => d.checked_in_at).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <PageTitle title="Attendance" />

      <View style={styles.switcher}>
        <MonthButton icon="chevron-left" label="Previous month" onPress={() => setMonth(shiftMonth(month, -1))} />
        <T v="subheading">{monthLabel(month)}</T>
        <MonthButton
          icon="chevron-right"
          label="Next month"
          disabled={isCurrent}
          onPress={() => setMonth(shiftMonth(month, 1))}
        />
      </View>

      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <Failed error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: space.md }}>
            <Stat label="Present" value={String(present)} tone="ok" />
            <Stat label="Absent" value={String(absent)} tone="bad" />
            <Stat label="Rate" value={rate === null ? '–' : `${rate}%`} tone="ink" />
          </View>

          <Card style={{ gap: space.sm }}>
            <View style={styles.week}>
              {WEEKDAYS.map((w) => (
                <T key={w} v="label" tone={w === 'Sat' ? 'bad' : 'muted'} style={styles.weekday}>
                  {w}
                </T>
              ))}
            </View>
            <MonthGrid month={month} byDate={byDate} />
            <Divider />
            <View style={styles.legend}>
              <Legend color={c.okTint} edge={c.ok} label="Present" />
              <Legend color={c.badTint} edge={c.bad} label="Absent" />
              <Legend color="transparent" edge={c.brand} label="Today" />
            </View>
          </Card>

          {days.length === 0 ? (
            <Empty icon="calendar" title="No attendance this month" body="Days appear here once the school marks them." />
          ) : null}

          {withTimes.length ? (
            <>
              <SectionLabel>Card reader times</SectionLabel>
              <Card>
                {withTimes.map((d, i) => (
                  <View key={d.date} style={{ gap: space.md }}>
                    {i ? <Divider /> : null}
                    <Row
                      label={`${bsWeekday(d.date)} ${Number(d.date.slice(8))}`}
                      value={`In ${clock(d.checked_in_at)}${d.checked_out_at ? ` · Out ${clock(d.checked_out_at)}` : ''}`}
                    />
                  </View>
                ))}
              </Card>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function MonthGrid({ month, byDate }: { month: BsMonth; byDate: Map<string, AttendanceDay> }) {
  const c = usePalette();
  const today = bsToday();
  const blanks = firstWeekday(month);
  const total = daysInMonth(month);
  const cells: (number | null)[] = [...Array(blanks).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <View style={styles.grid}>
      {cells.map((day, i) => {
        if (!day) return <View key={`b${i}`} style={styles.cell} />;
        const date = `${month.year}-${pad(month.month)}-${pad(day)}`;
        const record = byDate.get(date);
        const isToday = date === today;
        const saturday = i % 7 === 6;
        const bg = record ? (record.status ? c.okTint : c.badTint) : 'transparent';
        const fg = record ? (record.status ? c.ok : c.bad) : saturday ? c.bad : date > today ? c.off : c.inkSoft;
        return (
          <View key={date} style={styles.cell}>
            <View
              accessibilityLabel={`${day}: ${record ? (record.status ? 'present' : 'absent') : 'not marked'}`}
              style={[
                styles.day,
                { backgroundColor: bg },
                isToday && { borderWidth: 2, borderColor: c.brand },
              ]}>
              <T v={record ? 'smallStrong' : 'small'} style={{ color: fg }}>
                {String(day)}
              </T>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'bad' | 'ink' }) {
  return (
    <Card style={{ flex: 1, gap: space.xs, paddingVertical: space.md }}>
      <T v="label" tone="muted" style={{ textTransform: 'uppercase' }}>
        {label}
      </T>
      <T v="heading" tone={tone}>
        {value}
      </T>
    </Card>
  );
}

function Legend({ color, edge, label }: { color: string; edge: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 }}>
      <View style={{ width: 14, height: 14, borderRadius: 4, backgroundColor: color, borderWidth: 1.5, borderColor: edge }} />
      <T v="small" tone="muted">
        {label}
      </T>
    </View>
  );
}

function MonthButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: 'chevron-left' | 'chevron-right';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.monthButton,
        { borderColor: c.lineStrong, backgroundColor: pressed ? c.surfaceAlt : c.surface },
        disabled && { opacity: 0.4 },
      ]}>
      <Feather name={icon} size={20} color={c.inkSoft} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  switcher: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: {
    width: 44,
    height: 44,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', textTransform: 'uppercase', fontSize: type.label.fontSize - 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  day: { flex: 1, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
});
