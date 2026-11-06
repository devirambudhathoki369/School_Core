import { Pressable, ScrollView, View } from 'react-native';

import { useActive } from '@/accounts/store';
import { useApi } from '@/api/hooks';
import type { components } from '@/api/schema';
import type { StudentHome } from '@/api/types';
import { bsShort, bsToday, clock, dueLabel, rupees } from '@/lib/format';
import { radius, space, usePalette } from '@/theme';
import { Icon } from '@/ui/Icon';
import { Card, Divider, ListRow, Screen, SectionLabel, T } from '@/ui/kit';
import { Chip, Loaded, Row, Shortcut, Shortcuts, Tile, useTone } from '@/ui/parts';
import { useGo } from '../nav';
import { Freshness, HomeHeader } from '../parts';
import { useChild } from './context';

export function ChildHome() {
  const c = usePalette();
  const account = useActive();
  const { child, children, choose } = useChild();
  const go = useGo();
  const home = useApi<StudentHome>(child ? `students/${child.id}/home` : null);
  const parent = account.role === 'parent';
  // a student whose parent has not joined yet is asked to invite them
  const invite = useApi<components['schemas']['InviteStatusOut']>(parent ? null : 'me/parent-invite', {
    staleTime: 60 * 60_000,
  });

  return (
    <Screen
      onRefresh={() => void home.refetch()}
      refreshing={home.isRefetching}
      header={
        <HomeHeader
          name={child?.name ?? account.name}
          sub={child ? [child.class_name, child.roll_no ? `Roll ${child.roll_no}` : null].filter(Boolean).join(' · ') : ''}
          school={account.school.name}
        />
      }>
      {parent && children.length > 1 ? <ChildSwitcher current={child?.id} onChoose={choose} /> : null}
      {!child ? (
        <Card>
          <T>No student is linked to this account yet. Please contact the school office.</T>
        </Card>
      ) : (
        <Loaded query={home}>
          {(data) => (
            <>
              <Freshness updatedAt={home.dataUpdatedAt} error={home.error} />
              <TodayCard today={data.today} />
              {invite.data?.can_invite ? (
                <Pressable onPress={() => go('/invite')} accessibilityRole="button">
                  <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <Icon name="parent" size={26} color={c.blueText} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T v="bodyStrong">Invite your parent</T>
                      <T v="small" tone="quiet">
                        They can follow your attendance, results and fees on their phone.
                      </T>
                    </View>
                    <Icon name="chevron-right" size={20} color={c.textFaint} />
                  </Card>
                </Pressable>
              ) : null}
              <Row>
                <Tile
                  label="Fees to pay"
                  icon="wallet"
                  tone={data.fees_due_paisa > 0 ? 'warn' : 'ok'}
                  value={data.fees_due_paisa > 0 ? rupees(data.fees_due_paisa) : 'All paid'}
                  onPress={() => go('/fees')}
                />
                <Tile
                  label="Homework to do"
                  icon="book"
                  value={String(data.homework_open)}
                  sub={data.homework_open ? 'Not handed in yet' : 'Nothing open'}
                  onPress={() => go('/homework')}
                />
              </Row>
              {data.homework.length ? (
                <>
                  <SectionLabel>Homework</SectionLabel>
                  <Card padded={false}>
                    {data.homework.map((hw, i) => (
                      <View key={hw.id}>
                        {i ? <Divider inset={70} /> : null}
                        <ListRow
                          icon="book"
                          title={hw.title}
                          sub={`${hw.subject} · ${dueLabel(hw.due_date, bsToday())}`}
                          onPress={() => go(`/homework/${hw.id}`)}
                        />
                      </View>
                    ))}
                  </Card>
                </>
              ) : null}
              <Shortcuts>
                <Shortcut icon="calendar" label="Attendance" onPress={() => go('/attendance')} />
                <Shortcut icon="award" label="Results" onPress={() => go('/results')} />
                <Shortcut icon="clock" label="Timetable" onPress={() => go('/timetable')} />
                <Shortcut icon="receipt" label="Payments" onPress={() => go('/fees-history')} />
                <Shortcut icon="bell" label="Notices" onPress={() => go('/notices')} />
                <Shortcut icon="sun" label="Calendar" onPress={() => go('/calendar')} />
              </Shortcuts>
              {data.events.length ? (
                <>
                  <SectionLabel>Coming up</SectionLabel>
                  <Card padded={false}>
                    {data.events.map((event, i) => (
                      <View key={event.id}>
                        {i ? <Divider inset={70} /> : null}
                        <ListRow
                          icon="calendar"
                          title={event.title}
                          sub={
                            event.start_date === event.end_date
                              ? bsShort(event.start_date)
                              : `${bsShort(event.start_date)} to ${bsShort(event.end_date)}`
                          }
                        />
                      </View>
                    ))}
                  </Card>
                </>
              ) : null}
              {data.notice ? (
                <>
                  <SectionLabel>Latest notice</SectionLabel>
                  <Pressable onPress={() => go('/notices')} accessibilityRole="button">
                    <Card>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                        <T v="bodyStrong" style={{ flex: 1 }}>
                          {data.notice.title}
                        </T>
                        <T v="small" tone="quiet">
                          {bsShort(data.notice.date)}
                        </T>
                      </View>
                      <T tone="soft" numberOfLines={3}>
                        {data.notice.body}
                      </T>
                    </Card>
                  </Pressable>
                </>
              ) : null}
            </>
          )}
        </Loaded>
      )}
    </Screen>
  );
}

function TodayCard({ today }: { today: StudentHome['today'] }) {
  const tone = today.status === 'present' ? 'ok' : today.status === 'absent' ? 'bad' : 'quiet';
  const { bg, fg } = useTone(tone);
  const c = usePalette();
  const line =
    today.status === 'present'
      ? today.checked_in_at
        ? `Present today, in at ${clock(today.checked_in_at)}`
        : 'Present today'
      : today.status === 'absent'
        ? 'Absent today'
        : 'Today’s attendance is not taken yet';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.card, backgroundColor: bg }}>
      <Icon name={today.status === 'absent' ? 'x' : today.status === 'present' ? 'check' : 'clock'} size={22} color={fg} />
      <T v="bodyStrong" style={{ color: today.status === 'not_taken' ? c.textSoft : fg, flex: 1 }}>
        {line}
      </T>
      {today.checked_out_at ? <Chip label={`Out ${clock(today.checked_out_at)}`} tone="ok" /> : null}
    </View>
  );
}

export function ChildSwitcher({ current, onChoose }: { current?: number; onChoose: (id: number) => void }) {
  const c = usePalette();
  const { children } = useChild();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
      {children.map((kid) => {
        const on = kid.id === current;
        return (
          <Pressable
            key={kid.id}
            onPress={() => onChoose(kid.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`Show ${kid.name}`}
            style={{
              paddingHorizontal: space.lg,
              paddingVertical: space.sm,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: on ? c.blue : c.lineStrong,
              backgroundColor: on ? c.blueTint : c.card,
            }}>
            <T v="smallStrong" tone={on ? 'blue' : 'soft'}>
              {kid.name.split(' ')[0]}
            </T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
