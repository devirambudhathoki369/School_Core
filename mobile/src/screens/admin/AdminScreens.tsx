import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useActive } from '@/accounts/store';
import { useApi, usePages, useWrite } from '@/api/hooks';
import type { AdminStudent, Collections, Dashboard, Dues, FamilyCode, Link, StaffDay, StudentRow } from '@/api/types';
import { bsAddDays, bsFromIso, bsLong, bsShort, bsToday, clock, rupees, titleCase } from '@/lib/format';
import { radius, space, type as typeScale, usePalette } from '@/theme';
import { Banner, Button, Card, Divider, Field, ListRow, Screen, SectionLabel, T } from '@/ui/kit';
import { Avatar, Bar, Chip, Empty, Line, LoadMore, Loaded, Row, Shortcut, Shortcuts, Tile } from '@/ui/parts';
import { useGo } from '../nav';
import { Freshness, HomeHeader, PageHeader } from '../parts';

function DayStepper({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const today = bsToday();
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.sm }}>
      <Button title="Day before" kind="quiet" onPress={() => onChange(bsAddDays(date, -1))} />
      <T v="bodyStrong">{date === today ? 'Today' : bsShort(date)}</T>
      <View style={{ opacity: date >= today ? 0.3 : 1 }}>
        <Button title="Next day" kind="quiet" disabled={date >= today} onPress={() => onChange(bsAddDays(date, 1))} />
      </View>
    </Card>
  );
}

export function AdminDashboardScreen() {
  const account = useActive();
  const go = useGo();
  const [date, setDate] = useState(bsToday());
  const dash = useApi<Dashboard>(`admin/dashboard?date=${date}`);
  return (
    <Screen
      onRefresh={() => void dash.refetch()}
      refreshing={dash.isRefetching}
      header={<HomeHeader name={account.school.name} sub="School admin" school={account.school.name} />}>
      <DayStepper date={date} onChange={setDate} />
      <Loaded query={dash}>
        {(d) => (
          <>
            <Freshness updatedAt={dash.dataUpdatedAt} error={dash.error} />
            <Row>
              <Tile
                label="Students in"
                icon="student"
                tone="ok"
                value={`${d.students.present}/${d.students.total}`}
                sub={`${d.students.absent} not in`}
                onPress={() => go('/students')}
              />
              <Tile
                label="Staff in"
                icon="staff"
                tone="ok"
                value={`${d.staff.present}/${d.staff.total}`}
                sub={`${d.staff.absent} not in`}
                onPress={() => go('/staff')}
              />
            </Row>
            <Row>
              <Tile
                label={date === bsToday() ? 'Collected today' : `Collected ${bsShort(date)}`}
                icon="wallet"
                tone="ok"
                value={rupees(d.collected.amount_paisa)}
                sub={`${d.collected.receipts} receipts`}
                onPress={() => go('/collections')}
              />
              <Tile
                label={`In ${d.month_label}`}
                icon="chart"
                tone="ok"
                value={rupees(d.collected_month_paisa)}
                onPress={() => go('/collections')}
              />
            </Row>
            <Tile label="Fees still to collect" icon="receipt" tone="warn" value={rupees(d.dues_paisa)} onPress={() => go('/fees')} />
            {d.links_to_review ? (
              <Pressable onPress={() => go('/parents')} accessibilityRole="button">
                <Banner tone="warn">{`${d.links_to_review} parent links on shared phone numbers wait for your review.`}</Banner>
              </Pressable>
            ) : null}
            <SectionLabel>Students in, by class</SectionLabel>
            <Card>
              {d.classes.map((row, i) => (
                <View key={row.name} style={{ gap: space.xs }}>
                  {i ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <T v="smallStrong">{row.name}</T>
                    <T v="small" tone="quiet">{`${row.present}/${row.total}`}</T>
                  </View>
                  <Bar part={row.present} whole={row.total} />
                </View>
              ))}
            </Card>
            <Shortcuts>
              <Shortcut icon="parent" label="Parents" onPress={() => go('/parents')} />
              <Shortcut icon="bell" label="Notices" onPress={() => go('/notices')} />
              <Shortcut icon="sun" label="Calendar" onPress={() => go('/calendar')} />
            </Shortcuts>
          </>
        )}
      </Loaded>
    </Screen>
  );
}

export function AdminStudentsScreen() {
  const go = useGo();
  const [typed, setTyped] = useState('');
  const [query, setQuery] = useState('');
  const students = usePages<StudentRow>(`admin/students${query ? `?q=${encodeURIComponent(query)}` : ''}`);
  return (
    <Screen
      onRefresh={() => void students.refetch()}
      refreshing={students.isRefetching}
      header={<PageHeader title="Students" sub="Find a student by name or roll number" onBack={null} />}>
      <Field
        label="Search"
        value={typed}
        onChangeText={setTyped}
        returnKeyType="search"
        onSubmitEditing={() => setQuery(typed.trim())}
        placeholder="Name, roll or registration number"
        autoCorrect={false}
      />
      <Loaded
        query={{ ...students, data: students.data ? students.items : undefined }}
        empty={(items) => (items.length ? null : <Empty icon="search" title="No student found" />)}>
        {(items) => (
          <Card padded={false}>
            {items.map((s, i) => (
              <View key={s.id}>
                {i ? <Divider inset={70} /> : null}
                <ListRow
                  icon="student"
                  title={s.name}
                  sub={[s.class_name, s.roll_no ? `Roll ${s.roll_no}` : null].filter(Boolean).join(' · ')}
                  onPress={() => go(`/student/${s.id}`)}
                />
              </View>
            ))}
          </Card>
        )}
      </Loaded>
      <LoadMore {...students} />
    </Screen>
  );
}

export function AdminStudentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const write = useWrite();
  const student = useApi<AdminStudent>(id ? `admin/students/${id}` : null);
  const [code, setCode] = useState<FamilyCode | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function makeCode(guardianId: number) {
    setBusy(guardianId);
    setError(null);
    try {
      setCode(await write<FamilyCode>(`admin/guardians/${guardianId}/family-code`, 'POST', {}));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      onRefresh={() => void student.refetch()}
      refreshing={student.isRefetching}
      header={<PageHeader title={student.data?.student.name ?? 'Student'} sub={student.data?.student.class_name} />}>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {code ? <FamilyCodeCard code={code} onDone={() => setCode(null)} /> : null}
      <Loaded query={student}>
        {(d) => (
          <>
            <Row>
              <Tile label="Fees to pay" tone={d.dues.total_paisa > 0 ? 'warn' : 'ok'} value={rupees(d.dues.total_paisa)} />
              <Tile
                label={`Present in ${d.attendance.label.split(' ')[0]}`}
                tone={d.attendance.absent ? 'quiet' : 'ok'}
                value={`${d.attendance.present}/${d.attendance.taken}`}
              />
            </Row>
            <SectionLabel>Parents on the app</SectionLabel>
            {d.guardians.length ? (
              d.guardians.map((g) => (
                <Card key={g.link_id}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <Avatar name={g.name} />
                    <View style={{ flex: 1 }}>
                      <T v="bodyStrong">{g.name}</T>
                      <T v="small" tone="quiet">
                        {`${titleCase(g.relation)} · ${g.phone}${g.email ? ` · ${g.email}` : ''}`}
                      </T>
                    </View>
                    <Chip
                      label={g.state === 'linked' ? (g.on_app ? 'On the app' : 'Linked') : g.state === 'review' ? 'To review' : 'Rejected'}
                      tone={g.state === 'linked' ? 'ok' : g.state === 'review' ? 'warn' : 'bad'}
                    />
                  </View>
                  {g.state === 'linked' ? (
                    <Button
                      title={g.email ? 'Make a family code' : 'Make a family code (no email yet)'}
                      kind="secondary"
                      icon="key"
                      busy={busy === g.guardian_id}
                      onPress={() => void makeCode(g.guardian_id)}
                    />
                  ) : null}
                </Card>
              ))
            ) : (
              <T v="small" tone="quiet">
                No parent is linked yet. Parents are linked from the guardian phone number on the student record.
              </T>
            )}
            <SectionLabel>Record</SectionLabel>
            <Card>
              {d.profile.father_name ? <Line label="Father" value={d.profile.father_name} /> : null}
              {d.profile.mother_name ? <Line label="Mother" value={d.profile.mother_name} /> : null}
              {d.profile.guardian_contact ? <Line label="Guardian phone" value={d.profile.guardian_contact} /> : null}
              {d.profile.address ? <Line label="Address" value={d.profile.address} /> : null}
              {d.profile.birth_date ? <Line label="Born" value={bsLong(d.profile.birth_date)} /> : null}
            </Card>
            {d.dues.items.length ? (
              <>
                <SectionLabel>Fees to pay</SectionLabel>
                <Card>
                  {d.dues.items.map((item) => (
                    <Line key={item.title} label={titleCase(item.title)} value={rupees(item.amount_paisa)} tone="warn" />
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

function FamilyCodeCard({ code, onDone }: { code: FamilyCode; onDone: () => void }) {
  const c = usePalette();
  return (
    <Card style={{ borderColor: c.marigold, borderWidth: 2 }}>
      <T v="smallStrong" tone="soft">
        {`Family code for ${code.guardian.name}`}
      </T>
      <T style={{ ...typeScale.display, letterSpacing: 4, textAlign: 'center', color: c.text }}>{code.code}</T>
      <T v="small" tone="quiet">
        {`Give it to the parent now: it is shown only once and works until ${bsFromIso(code.expires_at)}. They enter it with their email in the app. Making a new one cancels this one.`}
      </T>
      <Button title="Done" kind="secondary" onPress={onDone} />
    </Card>
  );
}

export function AdminFeesScreen() {
  const go = useGo();
  const dues = useApi<Dues>('admin/fees/dues');
  const collections = useApi<Collections>('admin/fees/collections');
  return (
    <Screen
      onRefresh={() => void Promise.all([dues.refetch(), collections.refetch()])}
      refreshing={dues.isRefetching}
      header={<PageHeader title="Fees" sub="Dues and money received" onBack={null} />}>
      <Row>
        <Tile label="Still to collect" tone="warn" icon="receipt" value={dues.data ? rupees(dues.data.total_paisa) : '…'} />
        <Tile
          label="Received this month"
          tone="ok"
          icon="wallet"
          value={collections.data ? rupees(collections.data.total_paisa) : '…'}
          onPress={() => go('/collections')}
        />
      </Row>
      <SectionLabel>Dues by class</SectionLabel>
      <Loaded query={dues}>
        {(d) => (
          <Card padded={false}>
            {d.classes.map((row, i) => (
              <View key={row.class_id}>
                {i ? <Divider inset={70} /> : null}
                <ListRow
                  icon="users"
                  tint={row.due_paisa ? 'marigold' : 'ok'}
                  title={row.class_name}
                  sub={`${row.owing} of ${row.students} owe ${rupees(row.due_paisa)}`}
                  onPress={() => go(`/dues/${row.class_id}`)}
                />
              </View>
            ))}
          </Card>
        )}
      </Loaded>
    </Screen>
  );
}

export function ClassDuesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const go = useGo();
  const dues = useApi<Dues>(id ? `admin/fees/dues?class=${id}` : null);
  const klass = dues.data?.classes[0];
  return (
    <Screen
      onRefresh={() => void dues.refetch()}
      refreshing={dues.isRefetching}
      header={<PageHeader title={klass?.class_name ?? 'Dues'} sub={klass ? `${rupees(klass.due_paisa)} to collect` : undefined} />}>
      <Loaded query={dues}>
        {(d) => (
          <Card padded={false}>
            {d.students.map((s, i) => (
              <View key={s.id}>
                {i ? <Divider inset={70} /> : null}
                <ListRow
                  icon="student"
                  tint={s.due_paisa > 0 ? 'marigold' : 'ok'}
                  title={s.name}
                  sub={s.roll_no ? `Roll ${s.roll_no}` : undefined}
                  onPress={() => go(`/student/${s.id}`)}
                  trailing={<Chip label={s.due_paisa > 0 ? rupees(s.due_paisa) : 'Paid'} tone={s.due_paisa > 0 ? 'warn' : 'ok'} />}
                />
              </View>
            ))}
          </Card>
        )}
      </Loaded>
    </Screen>
  );
}

export function CollectionsScreen() {
  const collections = useApi<Collections>('admin/fees/collections');
  return (
    <Screen
      onRefresh={() => void collections.refetch()}
      refreshing={collections.isRefetching}
      header={
        <PageHeader
          title="Money received"
          sub={collections.data ? `${bsShort(collections.data.start)} to ${bsShort(collections.data.end)}` : undefined}
        />
      }>
      <Loaded query={collections}>
        {(d) => (
          <>
            <Card>
              <Line label="Total" value={rupees(d.total_paisa)} strong tone="ok" />
              {d.by_mode.map((m) => (
                <Line key={m.mode} label={titleCase(m.label)} value={rupees(m.amount_paisa)} />
              ))}
            </Card>
            <SectionLabel>By day</SectionLabel>
            <Card padded={false}>
              {d.days.map((day, i) => (
                <View key={day.date}>
                  {i ? <Divider inset={70} /> : null}
                  <ListRow icon="wallet" tint="ok" title={rupees(day.amount_paisa)} sub={bsLong(day.date)} />
                </View>
              ))}
            </Card>
          </>
        )}
      </Loaded>
    </Screen>
  );
}

export function AdminStaffScreen() {
  const [date, setDate] = useState(bsToday());
  const staff = useApi<StaffDay>(`admin/staff/attendance?date=${date}`);
  return (
    <Screen
      onRefresh={() => void staff.refetch()}
      refreshing={staff.isRefetching}
      header={<PageHeader title="Staff" sub="Who is in" onBack={null} />}>
      <DayStepper date={date} onChange={setDate} />
      <Loaded query={staff}>
        {(d) => (
          <>
            <Row>
              <Tile label="In" tone="ok" value={String(d.totals.present)} />
              <Tile label="Not in" tone={d.totals.absent ? 'bad' : 'quiet'} value={String(d.totals.absent)} />
            </Row>
            <Card padded={false}>
              {d.items.map((s, i) => (
                <View key={s.id}>
                  {i ? <Divider inset={70} /> : null}
                  <ListRow
                    icon="staff"
                    tint={s.status === 'present' ? 'ok' : s.status === 'absent' ? 'bad' : 'blue'}
                    title={s.name}
                    sub={[s.designation, s.checked_in_at ? `in ${clock(s.checked_in_at)}` : null].filter(Boolean).join(' · ')}
                    trailing={
                      <Chip
                        label={s.status === 'present' ? 'In' : s.status === 'absent' ? 'Absent' : 'Not in'}
                        tone={s.status === 'present' ? 'ok' : s.status === 'absent' ? 'bad' : 'quiet'}
                      />
                    }
                  />
                </View>
              ))}
            </Card>
          </>
        )}
      </Loaded>
    </Screen>
  );
}

export function ParentLinksScreen() {
  const c = usePalette();
  const write = useWrite();
  const links = usePages<Link>('admin/guardian-links?state=2');
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(link: Link, decision: 'confirm' | 'reject') {
    setBusy(link.id);
    setError(null);
    try {
      await write(`admin/guardian-links/${link.id}/decide`, 'POST', { decision });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen
      onRefresh={() => void links.refetch()}
      refreshing={links.isRefetching}
      header={<PageHeader title="Parents to review" sub="Phone numbers shared by different families" />}>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <T v="small" tone="quiet">
        These students share a guardian phone number with another family, so the app did not link them on its own.
        Confirm only if this parent is really the student’s parent.
      </T>
      <Loaded
        query={{ ...links, data: links.data ? links.items : undefined }}
        empty={(items) =>
          items.length ? null : <Empty icon="check" title="Nothing to review" body="Every parent link is decided." />
        }>
        {(items) =>
          items.map((link) => (
            <Card key={link.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Avatar name={link.student.name} photo={link.student.photo_url} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{link.student.name}</T>
                  <T v="small" tone="quiet">
                    {link.student.class_name}
                  </T>
                </View>
              </View>
              <View style={{ padding: space.md, borderRadius: radius.control, backgroundColor: c.cardAlt, gap: 2 }}>
                <T v="smallStrong">{`${link.guardian.name} · ${link.guardian.phone}`}</T>
                <T v="small" tone="quiet">
                  {link.shared_with.length ? `Also on this number: ${link.shared_with.join(', ')}` : 'No other child on this number'}
                </T>
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <Button title="Not their parent" kind="danger" busy={busy === link.id} onPress={() => void decide(link, 'reject')} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Confirm" icon="check" busy={busy === link.id} onPress={() => void decide(link, 'confirm')} />
                </View>
              </View>
            </Card>
          ))
        }
      </Loaded>
      <LoadMore {...links} />
    </Screen>
  );
}
