import { Image } from 'expo-image';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { useActive } from '@/accounts/store';
import { ApiError } from '@/api/client';
import { useApi, useMe, usePages, useWrite } from '@/api/hooks';
import type { Calendar, Notice } from '@/api/types';
import { bsLong, bsShort, monthName } from '@/lib/format';
import { radius, space } from '@/theme';
import { Banner, Button, Card, Divider, Field, ListRow, Screen, SectionLabel, T } from '@/ui/kit';
import { Chip, Empty, LoadMore, Loaded, type Tone } from '@/ui/parts';
import { back, useGo } from '../nav';
import { PageHeader } from '../parts';

const PUBLISH_NOTICES = 1651;

/** The school admin, and staff allowed to (1651), may publish notices. */
export function useCanPublish() {
  const account = useActive();
  const me = useMe().data;
  return account.role === 'admin' || (account.role === 'staff' && !!me?.permissions?.includes(PUBLISH_NOTICES));
}

export function NoticesScreen({ root }: { root?: boolean }) {
  const notices = usePages<Notice>('notices');
  const canPublish = useCanPublish();
  const go = useGo();
  return (
    <Screen
      onRefresh={() => void notices.refetch()}
      refreshing={notices.isRefetching}
      header={<PageHeader title="Notices" sub={useActive().school.name} onBack={root ? null : undefined} />}>
      {canPublish ? <Button title="Publish a notice" icon="send" onPress={() => go('/notice-new')} /> : null}
      <Loaded
        query={{ ...notices, data: notices.data ? notices.items : undefined }}
        empty={(items) => (items.length ? null : <Empty icon="bell" title="No notices yet" />)}>
        {(items) =>
          items.map((notice) => (
            <Card key={notice.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                <T v="bodyStrong" style={{ flex: 1 }}>
                  {notice.title}
                </T>
                <T v="small" tone="quiet">
                  {bsShort(notice.date)}
                </T>
              </View>
              <T tone="soft">{notice.body}</T>
              {notice.image_url ? (
                <Image
                  source={notice.image_url}
                  style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.control }}
                  contentFit="cover"
                  accessibilityLabel={notice.title}
                />
              ) : null}
            </Card>
          ))
        }
      </Loaded>
      <LoadMore {...notices} />
    </Screen>
  );
}

export function NewNoticeScreen() {
  const write = useWrite();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function publish() {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await write('notices', 'POST', { title: title.trim(), body: body.trim() });
      back();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError && e.status === 0 ? 'No connection. Publish it again when you are online.' : (e as Error).message);
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<PageHeader title="Publish a notice" sub="Every parent, student and staff member of the school sees it." />}>
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <Card>
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={50} error={fields.title} />
          <Field
            label="Notice"
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={5000}
            error={fields.body}
            style={{ minHeight: 140, textAlignVertical: 'top' }}
          />
          <Button
            title="Publish"
            icon="send"
            busy={busy}
            disabled={title.trim().length < 2 || body.trim().length < 2}
            onPress={() => void publish()}
          />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const EVENT_TONE: Record<string, Tone> = { holiday: 'ok', vacation: 'ok', exam: 'warn', result: 'blue', event: 'blue' };
const EVENT_LABEL: Record<string, string> = {
  holiday: 'Holiday',
  vacation: 'Vacation',
  exam: 'Exam',
  result: 'Results',
  event: 'Event',
};

export function CalendarScreen() {
  const calendar = useApi<Calendar>('calendar');
  return (
    <Screen
      onRefresh={() => void calendar.refetch()}
      refreshing={calendar.isRefetching}
      header={<PageHeader title="School calendar" sub="This month and the next two" />}>
      <Loaded
        query={calendar}
        empty={(data) => (data.items.length ? null : <Empty icon="calendar" title="Nothing on the calendar" />)}>
        {(data) => {
          const months = new Map<string, Calendar['items']>();
          for (const event of data.items) {
            const key = event.start_date < data.start ? data.start.slice(0, 7) : event.start_date.slice(0, 7);
            months.set(key, [...(months.get(key) ?? []), event]);
          }
          return [...months.entries()].map(([key, events]) => (
            <View key={key} style={{ gap: space.md }}>
              <SectionLabel>{`${monthName(key.slice(5, 7))} ${key.slice(0, 4)}`}</SectionLabel>
              <Card padded={false}>
                {events.map((event, i) => (
                  <View key={event.id}>
                    {i ? <Divider inset={70} /> : null}
                    <ListRow
                      icon="calendar"
                      tint={EVENT_TONE[event.type] === 'warn' ? 'marigold' : EVENT_TONE[event.type] === 'ok' ? 'ok' : 'blue'}
                      title={event.title}
                      sub={
                        event.start_date === event.end_date
                          ? bsLong(event.start_date)
                          : `${bsShort(event.start_date)} to ${bsLong(event.end_date)}`
                      }
                      trailing={<Chip label={EVENT_LABEL[event.type] ?? 'Event'} tone={EVENT_TONE[event.type] ?? 'blue'} />}
                    />
                  </View>
                ))}
              </Card>
            </View>
          ));
        }}
      </Loaded>
    </Screen>
  );
}
