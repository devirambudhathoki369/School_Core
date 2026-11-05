import { Feather } from '@expo/vector-icons';
import { Linking, Pressable, View } from 'react-native';

import { mediaUrl } from '@/api/client';
import { useHomework, useMe } from '@/api/queries';
import type { Homework } from '@/api/types';
import { bsShort, bsToday, daysBetween } from '@/lib/format';
import { Card, Empty, Failed, Loading, PageTitle, Pill, Screen, SectionLabel, T } from '@/ui/kit';
import { space, usePalette } from '@/ui/theme';

function dueText(days: number | null, date: string): [string, 'bad' | 'warn' | 'brand' | 'off'] {
  if (days === null) return [`Due ${bsShort(date)}`, 'off'];
  if (days < 0) return [`Was due ${bsShort(date)}`, 'off'];
  if (days === 0) return ['Due today', 'bad'];
  if (days === 1) return ['Due tomorrow', 'warn'];
  return [`Due ${bsShort(date)} · in ${days} days`, 'brand'];
}

export default function HomeworkScreen() {
  const { me, isLoading, error, refetch } = useMe();
  const query = useHomework(me);
  const today = bsToday();

  if (isLoading) return <Screen><Loading /></Screen>;
  if (!me) return <Screen><Failed error={error} onRetry={() => refetch()} /></Screen>;

  const all = query.data ?? [];
  const open = all
    .filter((h) => (daysBetween(today, h.due_date) ?? -1) >= 0)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const past = all
    .filter((h) => (daysBetween(today, h.due_date) ?? -1) < 0)
    .sort((a, b) => b.due_date.localeCompare(a.due_date));

  return (
    <Screen onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <PageTitle title="Homework" sub={me.className} />
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <Failed error={query.error} onRetry={() => query.refetch()} />
      ) : all.length === 0 ? (
        <Empty icon="book-open" title="No homework yet" body="Homework your teachers set appears here." />
      ) : (
        <>
          <SectionLabel>{open.length ? `Open · ${open.length}` : 'Open'}</SectionLabel>
          {open.length ? (
            open.map((h) => <Item key={h.id} homework={h} days={daysBetween(today, h.due_date)} />)
          ) : (
            <Card>
              <T tone="muted">Nothing is due. Well done.</T>
            </Card>
          )}
          {past.length ? (
            <>
              <SectionLabel>Earlier</SectionLabel>
              {past.map((h) => (
                <Item key={h.id} homework={h} days={daysBetween(today, h.due_date)} />
              ))}
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Item({ homework, days }: { homework: Homework; days: number | null }) {
  const c = usePalette();
  const [due, tone] = dueText(days, homework.due_date);
  const files = (homework.files ?? []).filter((f): f is string => !!f);
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, alignItems: 'center' }}>
        <T v="smallStrong" tone="brand">
          {homework.subject_name ?? 'Homework'}
        </T>
        <Pill tone={tone}>{due}</Pill>
      </View>
      <T v="bodyStrong">{homework.title}</T>
      {homework.description ? <T tone="soft">{homework.description}</T> : null}
      {files.map((file, i) => (
        <Pressable
          key={file}
          accessibilityRole="link"
          onPress={() => {
            const url = mediaUrl(file);
            if (url) void Linking.openURL(url);
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Feather name="paperclip" size={16} color={c.brandInk} />
          <T v="smallStrong" tone="brand">
            {`Attachment ${files.length > 1 ? i + 1 : ''}`.trim()}
          </T>
        </Pressable>
      ))}
    </Card>
  );
}
