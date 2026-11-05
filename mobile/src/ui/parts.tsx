import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { DayMark } from '@/api/types';
import { WEEKDAYS } from '@/lib/format';
import { font, radius, space, type, usePalette } from '@/theme';
import { Icon, type IconName } from './Icon';
import { Button, Card, T } from './kit';
import { initials } from './SchoolCard';

/** Colour has one meaning each (SPEC §7): ok = present, paid, done;
 *  bad = absent, overdue; warn = due soon, offline, fees owed; blue = actions. */
export type Tone = 'ok' | 'bad' | 'warn' | 'blue' | 'quiet';

export function useTone(tone: Tone) {
  const c = usePalette();
  return {
    ok: { bg: c.okTint, fg: c.ok },
    bad: { bg: c.badTint, fg: c.bad },
    warn: { bg: c.marigoldTint, fg: c.marigoldText },
    blue: { bg: c.blueTint, fg: c.blueText },
    quiet: { bg: c.cardAlt, fg: c.textQuiet },
  }[tone];
}

/** A small status label. No dot before it (SPEC §7). */
export function Chip({ label, tone = 'quiet' }: { label: string; tone?: Tone }) {
  const { bg, fg } = useTone(tone);
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[type.label, { color: fg, letterSpacing: 0.2 }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A figure with a label, for the top of a screen. */
export function Tile({
  label,
  value,
  sub,
  tone = 'blue',
  icon,
  onPress,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: Tone;
  icon?: IconName;
  onPress?: () => void;
}) {
  const c = usePalette();
  const { bg, fg } = useTone(tone);
  const body = (
    <View style={[styles.tile, { backgroundColor: c.card, borderColor: c.line }]}>
      {icon ? (
        <View style={[styles.tileIcon, { backgroundColor: bg }]}>
          <Icon name={icon} size={20} color={fg} />
        </View>
      ) : null}
      <T v="small" tone="quiet" numberOfLines={1}>
        {label}
      </T>
      <Text style={{ fontFamily: font.heavy, fontSize: 22, lineHeight: 28, color: tone === 'blue' ? c.text : fg }}>
        {value}
      </Text>
      {sub ? (
        <T v="small" tone="quiet" numberOfLines={2}>
          {sub}
        </T>
      ) : null}
    </View>
  );
  if (!onPress) return <View style={{ flex: 1 }}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [{ flex: 1 }, pressed && { opacity: 0.85 }]}>
      {body}
    </Pressable>
  );
}

export function Row({ children, gap = space.md }: { children: ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', gap }}>{children}</View>;
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
}) {
  const c = usePalette();
  return (
    <View style={[styles.segmented, { backgroundColor: c.cardAlt, borderColor: c.line }]} accessibilityRole="tablist">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[styles.segment, on && { backgroundColor: c.card, borderColor: c.line, borderWidth: 1 }]}>
            <Text style={[type.smallStrong, { color: on ? c.blueText : c.textQuiet }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Empty({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  const c = usePalette();
  return (
    <View style={[styles.empty, { borderColor: c.line }]}>
      <View style={[styles.tileIcon, { backgroundColor: c.blueTint, width: 48, height: 48, borderRadius: 14 }]}>
        <Icon name={icon} size={24} color={c.blueText} />
      </View>
      <T v="bodyStrong" center>
        {title}
      </T>
      {body ? (
        <T v="small" tone="quiet" center>
          {body}
        </T>
      ) : null}
    </View>
  );
}

export function Failed({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'This could not be loaded.';
  return (
    <Card style={{ alignItems: 'center' }}>
      <Icon name="wifi-off" size={28} color={usePalette().textQuiet} />
      <T center>{message}</T>
      {onRetry ? <Button title="Try again" kind="secondary" icon="refresh" onPress={onRetry} /> : null}
    </Card>
  );
}

/** Loading, failed or empty, else the content. */
export function Loaded<D>({
  query,
  children,
  empty,
}: {
  query: { data?: D; isLoading: boolean; error: unknown; refetch: () => unknown };
  children: (data: D) => ReactNode;
  empty?: (data: D) => ReactNode | null;
}) {
  const c = usePalette();
  if (query.data !== undefined) {
    const nothing = empty?.(query.data);
    return <>{nothing ?? children(query.data)}</>;
  }
  if (query.error) return <Failed error={query.error} onRetry={() => void query.refetch()} />;
  return (
    <View style={{ paddingVertical: space.xxxl, alignItems: 'center' }}>
      <ActivityIndicator color={c.blue} />
    </View>
  );
}

export function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => unknown;
}) {
  if (!hasNextPage) return null;
  return <Button title="Show more" kind="secondary" busy={isFetchingNextPage} onPress={() => void fetchNextPage()} />;
}

export function Avatar({ name, photo, size = 44, tone = 'blue' }: { name: string; photo?: string | null; size?: number; tone?: Tone }) {
  const { bg, fg } = useTone(tone);
  if (photo) {
    return <Image source={photo} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityLabel={name} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.heavy, fontSize: size * 0.36, color: fg }}>{initials(name) || '?'}</Text>
    </View>
  );
}

/** A flat bar: part of a whole. */
export function Bar({ part, whole, tone = 'ok' }: { part: number; whole: number; tone?: Tone }) {
  const c = usePalette();
  const { fg } = useTone(tone);
  const share = whole > 0 ? Math.min(1, Math.max(0, part / whole)) : 0;
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: c.cardAlt, overflow: 'hidden' }}>
      <View style={{ width: `${share * 100}%`, height: 8, backgroundColor: fg }} />
    </View>
  );
}

/** A Bikram Sambat month: one square per day, present in green, absent in
 *  orange-red, untaken plain. The server sends the month's length and the
 *  weekday it starts on, so the app does no date arithmetic of its own. */
export function MonthGrid({
  days,
  marks,
  startsOn,
  monthKey,
  today,
}: {
  days: number;
  marks: DayMark[];
  startsOn: number;
  monthKey: string;
  today?: string;
}) {
  const c = usePalette();
  const byDay = new Map(marks.map((m) => [Number(m.date.slice(8, 10)), m.status]));
  const cells: (number | null)[] = [...Array(startsOn).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const todayDay = today?.startsWith(monthKey) ? Number(today.slice(8, 10)) : null;
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row' }}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={[type.label, styles.gridHead, { color: c.textQuiet }]}>
            {d.slice(0, 2)}
          </Text>
        ))}
      </View>
      {Array.from({ length: cells.length / 7 }, (_, week) => (
        <View key={week} style={{ flexDirection: 'row', gap: 6 }}>
          {cells.slice(week * 7, week * 7 + 7).map((day, i) => {
            const status = day ? byDay.get(day) : undefined;
            const bg = status === 'present' ? c.okTint : status === 'absent' ? c.badTint : 'transparent';
            const fg = status === 'present' ? c.ok : status === 'absent' ? c.bad : c.textSoft;
            return (
              <View
                key={i}
                accessibilityLabel={day ? `${day}: ${status ?? 'not taken'}` : undefined}
                style={[
                  styles.gridCell,
                  { backgroundColor: bg },
                  day === todayDay && { borderWidth: 2, borderColor: c.blue },
                ]}>
                {day ? <Text style={{ fontFamily: status ? font.bold : font.medium, fontSize: 14, color: fg }}>{day}</Text> : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** A square shortcut in a grid of three. */
export function Shortcut({ icon, label, onPress, tone = 'blue' }: { icon: IconName; label: string; onPress: () => void; tone?: Tone }) {
  const c = usePalette();
  const { bg, fg } = useTone(tone);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.shortcut, { backgroundColor: c.card, borderColor: c.line }, pressed && { backgroundColor: c.cardAlt }]}>
      <View style={[styles.tileIcon, { backgroundColor: bg }]}>
        <Icon name={icon} size={22} color={fg} />
      </View>
      <T v="smallStrong" center numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

export function Shortcuts({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>{children}</View>;
}

/** Two values on a line: a label and its figure. */
export function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: Tone }) {
  const { fg } = useTone(tone ?? 'quiet');
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md, alignItems: 'center' }}>
      <T tone="soft" style={{ flexShrink: 1 }}>
        {label}
      </T>
      <T v={strong ? 'bodyStrong' : 'body'} style={tone ? { color: fg, fontFamily: font.bold } : undefined}>
        {value}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  tile: { borderWidth: 1, borderRadius: radius.card, padding: space.lg, gap: 4, minHeight: 112 },
  tileIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  segmented: { flexDirection: 'row', borderRadius: radius.control, borderWidth: 1, padding: 3, gap: 3 },
  segment: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.card, padding: space.xxl, alignItems: 'center', gap: space.sm },
  gridHead: { flex: 1, textAlign: 'center' },
  gridCell: { flex: 1, aspectRatio: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  shortcut: { width: '30.5%', flexGrow: 1, borderWidth: 1, borderRadius: radius.card, paddingVertical: space.lg, paddingHorizontal: space.sm, alignItems: 'center', gap: 6 },
});
