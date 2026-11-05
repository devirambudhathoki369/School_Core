import { useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { useActive } from '@/accounts/store';
import { api, ApiError } from '@/api/client';
import { newKey, useApi, useMe, usePages, useWrite } from '@/api/hooks';
import type { ClassDay, HandIns, StaffClasses, StaffHomework, StaffToday } from '@/api/types';
import { bsAddDays, bsLong, bsShort, bsToday, clock, dueLabel } from '@/lib/format';
import { enqueue, useQueue } from '@/offline/queue';
import { radius, space, usePalette } from '@/theme';
import { Banner, Button, Card, Divider, Field, ListRow, Screen, SectionLabel, T } from '@/ui/kit';
import { Avatar, Chip, Empty, LoadMore, Loaded, Row, Shortcut, Shortcuts, Tile } from '@/ui/parts';
import { AttendanceMonthView } from '../child/ChildAttendance';
import { FileList } from '../child/ChildHomework';
import { back, useGo } from '../nav';
import { Freshness, HomeHeader, PageHeader } from '../parts';

/** "Saved on this phone" for writes still waiting in the offline queue. */
export function QueueNote() {
  const account = useActive();
  const { pending, failed, sending } = useQueue(account.id);
  if (!pending.length && !failed.length) return null;
  return (
    <>
      {pending.length ? (
        <Banner tone="warn">
          {sending
            ? 'Sending what was saved on this phone…'
            : `${pending.length} saved on this phone, waiting for a connection: ${pending.map((j) => j.label).join('; ')}.`}
        </Banner>
      ) : null}
      {failed.map((job) => (
        <Banner key={job.key} tone="bad">{`Not sent: ${job.label}. ${job.error ?? ''}`}</Banner>
      ))}
    </>
  );
}

export function StaffTodayScreen() {
  const account = useActive();
  const me = useMe().data;
  const go = useGo();
  const today = useApi<StaffToday>('staff/today');
  return (
    <Screen
      onRefresh={() => void today.refetch()}
      refreshing={today.isRefetching}
      header={
        <HomeHeader
          name={me?.profile.name ?? account.name}
          sub={me?.profile.designation || 'Staff'}
          school={account.school.name}
        />
      }>
      <QueueNote />
      <Loaded query={today}>
        {(data) => (
          <>
            <Freshness updatedAt={today.dataUpdatedAt} error={today.error} />
            <Row>
              <Tile
                label="Your check-in"
                icon="clock"
                tone={data.check_in.status === 'present' ? 'ok' : data.check_in.status === 'absent' ? 'bad' : 'quiet'}
                value={
                  data.check_in.status === 'present'
                    ? data.check_in.checked_in_at
                      ? clock(data.check_in.checked_in_at)
                      : 'Present'
                    : data.check_in.status === 'absent'
                      ? 'Absent'
                      : 'Not yet'
                }
                onPress={() => go('/my-attendance')}
              />
              <Tile
                label="Hand-ins to check"
                icon="book"
                value={String(data.hand_ins_to_check)}
                onPress={() => go('/homework')}
              />
            </Row>
            {data.attendance.length ? (
              <>
                <SectionLabel>Attendance to take</SectionLabel>
                <Card padded={false}>
                  {data.attendance.map((row, i) => (
                    <View key={row.class_id}>
                      {i ? <Divider inset={70} /> : null}
                      <ListRow
                        icon="users"
                        tint={row.taken ? 'ok' : 'blue'}
                        title={row.class_name}
                        onPress={() => go(`/class/${row.class_id}`)}
                        trailing={<Chip label={row.taken ? 'Taken' : 'To take'} tone={row.taken ? 'ok' : 'warn'} />}
                      />
                    </View>
                  ))}
                </Card>
              </>
            ) : null}
            {data.periods.length ? (
              <>
                <SectionLabel>Your periods</SectionLabel>
                <Card padded={false}>
                  {data.periods.map((p, i) => (
                    <View key={`${p.class_id}-${p.period}`}>
                      {i ? <Divider inset={70} /> : null}
                      <ListRow
                        icon="clock"
                        title={`Period ${p.period} · ${p.class_name}`}
                        sub={p.subject ?? undefined}
                        onPress={() => go(`/class/${p.class_id}`)}
                      />
                    </View>
                  ))}
                </Card>
              </>
            ) : (
              <T v="small" tone="quiet">
                No periods are set for you in the timetable. Open any class from Classes.
              </T>
            )}
            <Shortcuts>
              <Shortcut icon="users" label="Classes" onPress={() => go('/classes')} />
              <Shortcut icon="calendar" label="My attendance" onPress={() => go('/my-attendance')} />
              <Shortcut icon="sun" label="Calendar" onPress={() => go('/calendar')} />
            </Shortcuts>
          </>
        )}
      </Loaded>
    </Screen>
  );
}

export function StaffClassesScreen() {
  const go = useGo();
  const classes = useApi<StaffClasses>('staff/classes');
  return (
    <Screen
      onRefresh={() => void classes.refetch()}
      refreshing={classes.isRefetching}
      header={<PageHeader title="Classes" sub="Take attendance and see who is in" onBack={null} />}>
      <QueueNote />
      <Loaded
        query={classes}
        empty={(data) =>
          data.items.length ? null : (
            <Empty icon="users" title="No classes" body="Classes you teach in the timetable show here." />
          )
        }>
        {(data) => {
          const mine = data.items.filter((c) => c.in_timetable);
          const others = data.items.filter((c) => !c.in_timetable);
          const list = (items: typeof data.items) => (
            <Card padded={false}>
              {items.map((klass, i) => (
                <View key={klass.id}>
                  {i ? <Divider inset={70} /> : null}
                  <ListRow
                    icon="users"
                    tint={klass.attendance_taken ? 'ok' : 'blue'}
                    title={klass.name}
                    sub={`${klass.students} students${klass.periods.length ? ` · period ${klass.periods.join(', ')}` : ''}`}
                    onPress={data.can_see_attendance ? () => go(`/class/${klass.id}`) : undefined}
                    trailing={
                      <Chip
                        label={klass.attendance_taken ? 'Taken today' : 'Not taken'}
                        tone={klass.attendance_taken ? 'ok' : 'quiet'}
                      />
                    }
                  />
                </View>
              ))}
            </Card>
          );
          return (
            <>
              {mine.length ? (
                <>
                  <SectionLabel>Your classes</SectionLabel>
                  {list(mine)}
                </>
              ) : null}
              {others.length ? (
                <>
                  <SectionLabel>{mine.length ? 'Other classes' : 'All classes'}</SectionLabel>
                  {list(others)}
                </>
              ) : null}
              {!data.can_see_attendance ? (
                <T v="small" tone="quiet">
                  Attendance needs a permission from the school admin.
                </T>
              ) : null}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}

export function ClassAttendanceScreen() {
  const c = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const account = useActive();
  const queryClient = useQueryClient();
  const today = bsToday();
  const [date, setDate] = useState(today);
  const path = `staff/classes/${id}/attendance?date=${date}`;
  const day = useApi<ClassDay>(id ? path : null);
  const { pending } = useQueue(account.id);
  const queued = pending.find((job) => job.path === path);
  // the marks on screen: what was saved, else everyone present
  const [edits, setEdits] = useState<Record<string, Record<number, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad' | 'warn'; text: string } | null>(null);

  const marks = useMemo(() => {
    const out: Record<number, boolean> = {};
    const queuedMarks = (queued?.body as { marks?: { student: number; present: boolean }[] } | undefined)?.marks;
    for (const s of day.data?.students ?? []) out[s.id] = s.status ? s.status === 'present' : true;
    for (const m of queuedMarks ?? []) out[m.student] = m.present;
    return { ...out, ...(edits[date] ?? {}) };
  }, [day.data, edits, date, queued]);

  const data = day.data;
  const editable = !!data?.can_save;
  const present = data ? data.students.filter((s) => marks[s.id]).length : 0;

  function toggle(studentId: number) {
    if (!editable) return;
    setMessage(null);
    setEdits((all) => ({ ...all, [date]: { ...(all[date] ?? {}), [studentId]: !marks[studentId] } }));
  }

  async function save() {
    if (!data) return;
    setBusy(true);
    setMessage(null);
    const body = { marks: data.students.map((s) => ({ student: s.id, present: !!marks[s.id] })) };
    const key = newKey();
    try {
      const answer = await api<ClassDay>(account.id, path, { method: 'PUT', body, idempotencyKey: key });
      queryClient.setQueryData([account.id, path], answer);
      void queryClient.invalidateQueries({ queryKey: [account.id, 'staff/today'] });
      void queryClient.invalidateQueries({ queryKey: [account.id, 'staff/classes'] });
      setEdits((all) => ({ ...all, [date]: {} }));
      setMessage({ tone: 'ok', text: `Saved: ${present} present, ${data.students.length - present} absent.` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) {
        enqueue({ key, accountId: account.id, path, method: 'PUT', body, label: `${data.class_name}, ${bsShort(date)}` });
        setMessage({ tone: 'warn', text: 'No connection. Saved on this phone; it is sent when you are back online.' });
      } else {
        setMessage({ tone: 'bad', text: (e as Error).message });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      onRefresh={() => void day.refetch()}
      refreshing={day.isRefetching}
      header={<PageHeader title={data?.class_name ?? 'Attendance'} sub={bsLong(date)} />}
      footer={
        data && editable ? (
          <Button
            title={`Save · ${present} present, ${data.students.length - present} absent`}
            icon="check"
            busy={busy}
            onPress={() => void save()}
          />
        ) : undefined
      }>
      <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button title="Day before" kind="quiet" onPress={() => setDate(bsAddDays(date, -1))} />
        <T v="bodyStrong">{date === today ? 'Today' : bsShort(date)}</T>
        <View style={{ opacity: date >= today ? 0.3 : 1 }}>
          <Button title="Next day" kind="quiet" disabled={date >= today} onPress={() => setDate(bsAddDays(date, 1))} />
        </View>
      </Card>
      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      {queued && !message ? <Banner tone="warn">Saved on this phone, waiting for a connection to send.</Banner> : null}
      <Loaded query={day}>
        {(d) => (
          <>
            <Freshness updatedAt={day.dataUpdatedAt} error={day.error} />
            {!d.taken && editable ? (
              <T v="small" tone="quiet">
                Everyone starts as present. Tap a student to mark them absent.
              </T>
            ) : null}
            {d.taken && !editable ? (
              <Banner tone="info">This day is saved. Changing it needs the permission to edit attendance.</Banner>
            ) : null}
            {!d.taken && !editable ? (
              <Banner tone="info">Taking attendance needs a permission from the school admin.</Banner>
            ) : null}
            <Card padded={false}>
              {d.students.map((student, i) => {
                const here = !!marks[student.id];
                return (
                  <View key={student.id}>
                    {i ? <Divider inset={70} /> : null}
                    <Pressable
                      onPress={() => toggle(student.id)}
                      disabled={!editable}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: here, disabled: !editable }}
                      accessibilityLabel={`${student.name}, ${here ? 'present' : 'absent'}`}
                      style={({ pressed }) => [
                        { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, minHeight: 64 },
                        pressed && { backgroundColor: c.cardAlt },
                      ]}>
                      <Avatar name={student.name} photo={student.photo_url} tone={here ? 'ok' : 'bad'} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <T v="bodyStrong">{student.name}</T>
                        <T v="small" tone="quiet">
                          {[student.roll_no ? `Roll ${student.roll_no}` : null, student.checked_in_at ? `card ${clock(student.checked_in_at)}` : null]
                            .filter(Boolean)
                            .join(' · ') || ' '}
                        </T>
                      </View>
                      <View
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: radius.pill,
                          backgroundColor: here ? c.okTint : c.badTint,
                        }}>
                        <T v="smallStrong" style={{ color: here ? c.ok : c.bad }}>
                          {here ? 'Present' : 'Absent'}
                        </T>
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </Card>
          </>
        )}
      </Loaded>
    </Screen>
  );
}

export function StaffHomeworkScreen() {
  const go = useGo();
  const homework = usePages<StaffHomework>('staff/homework');
  return (
    <Screen
      onRefresh={() => void homework.refetch()}
      refreshing={homework.isRefetching}
      header={<PageHeader title="Homework" sub="Set by you" onBack={null} />}>
      <Button title="Set homework" icon="plus" onPress={() => go('/homework-new')} />
      <Loaded
        query={{ ...homework, data: homework.data ? homework.items : undefined }}
        empty={(items) => (items.length ? null : <Empty icon="book" title="No homework yet" body="Homework you set shows here." />)}>
        {(items) => (
          <Card padded={false}>
            {items.map((hw, i) => (
              <View key={hw.id}>
                {i ? <Divider inset={70} /> : null}
                <ListRow
                  icon="book"
                  tint={hw.hand_ins.received ? 'marigold' : 'blue'}
                  title={hw.title}
                  sub={`${hw.class_name} · ${hw.subject} · ${dueLabel(hw.due_date, bsToday())}`}
                  onPress={() => go(`/homework/${hw.id}`)}
                  trailing={
                    hw.hand_ins.received ? (
                      <Chip label={`${hw.hand_ins.received} to check`} tone="warn" />
                    ) : (
                      <Chip label={`${hw.hand_ins.checked}/${hw.students} in`} tone={hw.hand_ins.checked ? 'ok' : 'quiet'} />
                    )
                  }
                />
              </View>
            ))}
          </Card>
        )}
      </Loaded>
      <LoadMore {...homework} />
    </Screen>
  );
}

type Picked = { name: string; uri: string; mimeType?: string | null; file?: File };

export function NewHomeworkScreen() {
  const c = usePalette();
  const write = useWrite();
  const classes = useApi<StaffClasses>('staff/classes');
  const today = bsToday();
  const [classId, setClassId] = useState<number | null>(null);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [due, setDue] = useState(bsAddDays(today, 1));
  const [files, setFiles] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const klass = classes.data?.items.find((k) => k.id === classId);
  const choices = (classes.data?.items ?? []).filter((k) => k.subjects.length);

  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (!result.canceled) {
      setFiles((now) => [...now, ...result.assets.map((a) => ({ name: a.name, uri: a.uri, mimeType: a.mimeType, file: a.file }))].slice(0, 10));
    }
  }

  async function submit() {
    if (!classId || !subjectId) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const form = new FormData();
      form.append('class_id', String(classId));
      form.append('subject_id', String(subjectId));
      form.append('title', title.trim());
      form.append('description', description.trim());
      form.append('due_date', due.trim());
      for (const f of files) {
        if (Platform.OS === 'web') form.append('files', f.file ?? (await (await fetch(f.uri)).blob()), f.name);
        else form.append('files', { uri: f.uri, name: f.name, type: f.mimeType ?? 'application/octet-stream' } as never);
      }
      await write('staff/homework', 'POST', form);
      back();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError && e.status === 0 ? 'No connection. Set it again when you are online.' : (e as Error).message);
      setBusy(false);
    }
  }

  const pill = (on: boolean) => ({
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: on ? c.blue : c.lineStrong,
    backgroundColor: on ? c.blueTint : c.card,
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<PageHeader title="Set homework" sub="The class's parents and students are told." />}>
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <Loaded query={classes}>
          {() => (
            <>
              <SectionLabel>Class</SectionLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {choices.map((k) => (
                  <Pressable
                    key={k.id}
                    onPress={() => {
                      setClassId(k.id);
                      setSubjectId(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: k.id === classId }}
                    style={pill(k.id === classId)}>
                    <T v="smallStrong" tone={k.id === classId ? 'blue' : 'soft'}>
                      {k.name}
                    </T>
                  </Pressable>
                ))}
              </View>
              {klass ? (
                <>
                  <SectionLabel>Subject</SectionLabel>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                    {klass.subjects.map((s) => (
                      <Pressable
                        key={s.id}
                        onPress={() => setSubjectId(s.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: s.id === subjectId }}
                        style={pill(s.id === subjectId)}>
                        <T v="smallStrong" tone={s.id === subjectId ? 'blue' : 'soft'}>
                          {s.name}
                        </T>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          )}
        </Loaded>
        <Card>
          <Field label="Title" value={title} onChangeText={setTitle} maxLength={200} error={fields.title} hint="At least 5 letters" />
          <Field
            label="What to do"
            value={description}
            onChangeText={setDescription}
            multiline
            maxLength={5000}
            error={fields.description}
            style={{ minHeight: 120, textAlignVertical: 'top' }}
          />
          <Field label="Due date (BS)" value={due} onChangeText={setDue} maxLength={10} error={fields.due_date} hint={bsLong(due)} />
          <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
            {[
              ['Tomorrow', 1],
              ['In 3 days', 3],
              ['In a week', 7],
            ].map(([label, days]) => (
              <Pressable key={label} onPress={() => setDue(bsAddDays(today, days as number))} style={pill(due === bsAddDays(today, days as number))}>
                <T v="smallStrong" tone="soft">
                  {label as string}
                </T>
              </Pressable>
            ))}
          </View>
          {files.map((f, i) => (
            <View key={`${f.uri}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <T style={{ flex: 1 }} numberOfLines={1}>
                {f.name}
              </T>
              <Button title="Remove" kind="quiet" onPress={() => setFiles((now) => now.filter((_, j) => j !== i))} />
            </View>
          ))}
          <Button title="Attach files" kind="secondary" icon="paperclip" onPress={() => void pick()} />
          <Button
            title="Set homework"
            icon="send"
            busy={busy}
            disabled={!classId || !subjectId || title.trim().length < 5 || !description.trim()}
            onPress={() => void submit()}
          />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

export function HandInsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const write = useWrite();
  const handIns = useApi<HandIns>(id ? `staff/homework/${id}/hand-ins` : null);
  const [remarks, setRemarks] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check(handInId: number, status: 'checked' | 'received') {
    setBusy(handInId);
    setError(null);
    try {
      await write(`staff/homework/${id}/hand-ins/${handInId}`, 'PATCH', {
        status,
        ...(remarks[handInId] !== undefined ? { remarks: remarks[handInId] } : {}),
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const hw = handIns.data?.homework;
  return (
    <Screen
      onRefresh={() => void handIns.refetch()}
      refreshing={handIns.isRefetching}
      header={<PageHeader title={hw?.title ?? 'Hand-ins'} sub={hw ? `${hw.class_name} · ${hw.subject} · due ${bsShort(hw.due_date)}` : undefined} />}>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Loaded query={handIns}>
        {(data) => (
          <>
            <Row>
              <Tile label="To check" value={String(data.homework.hand_ins.received)} tone={data.homework.hand_ins.received ? 'warn' : 'quiet'} />
              <Tile label="Checked" value={String(data.homework.hand_ins.checked)} tone="ok" />
              <Tile label="Not in" value={String(data.missing.length)} tone={data.missing.length ? 'bad' : 'quiet'} />
            </Row>
            {data.homework.description ? (
              <Card>
                <T tone="soft">{data.homework.description}</T>
              </Card>
            ) : null}
            <FileList files={data.homework.files} />
            {data.items.length ? <SectionLabel>Handed in</SectionLabel> : null}
            {data.items.map((item) => (
              <Card key={item.id}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <Avatar name={item.student_name} photo={item.photo_url} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">{item.student_name}</T>
                    <T v="small" tone="quiet">
                      {`${item.roll_no ? `Roll ${item.roll_no} · ` : ''}${bsShort(item.submitted_date)}`}
                    </T>
                  </View>
                  <Chip label={item.status === 'checked' ? 'Checked' : 'To check'} tone={item.status === 'checked' ? 'ok' : 'warn'} />
                </View>
                <FileList files={item.files} />
                <Field
                  label="Remarks for the student"
                  value={remarks[item.id] ?? item.remarks ?? ''}
                  onChangeText={(text) => setRemarks((all) => ({ ...all, [item.id]: text }))}
                  maxLength={500}
                />
                {item.status === 'checked' ? (
                  <Button title="Save remarks" kind="secondary" busy={busy === item.id} onPress={() => void check(item.id, 'checked')} />
                ) : (
                  <Button title="Mark checked" icon="check" busy={busy === item.id} onPress={() => void check(item.id, 'checked')} />
                )}
              </Card>
            ))}
            {data.missing.length ? (
              <>
                <SectionLabel>Not handed in</SectionLabel>
                <Card padded={false}>
                  {data.missing.map((s, i) => (
                    <View key={s.id}>
                      {i ? <Divider inset={70} /> : null}
                      <ListRow icon="student" tint="bad" title={s.name} sub={s.roll_no ? `Roll ${s.roll_no}` : undefined} />
                    </View>
                  ))}
                </Card>
              </>
            ) : null}
          </>
        )}
      </Loaded>
    </Screen>
  );
}

export function StaffOwnAttendanceScreen() {
  return <AttendanceMonthView path="staff/me/attendance" title="My attendance" sub="Your check-ins at school" />;
}
