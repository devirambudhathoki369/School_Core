import { Image } from 'expo-image';
import { View } from 'react-native';

import { useActive } from '@/accounts/store';
import { mediaUrl } from '@/api/client';
import { useMe } from '@/api/hooks';
import type { Child, Me } from '@/api/types';
import { font, radius, space, usePalette } from '@/theme';
import { Banner, Card, Divider, Loading, Screen, SectionLabel, T } from '@/ui/kit';
import { initials } from '@/ui/SchoolCard';
import { Freshness, HomeHeader } from './parts';

function useHome() {
  const account = useActive();
  const me = useMe();
  return { account, me, data: me.data };
}

function Detail({ label, value }: { label: string; value?: string | number | null }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
      <T tone="soft">{label}</T>
      <T v="bodyStrong" style={{ flexShrink: 1, textAlign: 'right' }}>
        {String(value)}
      </T>
    </View>
  );
}

function Shell({ sub, children }: { sub: (me: Me) => string; children: (me: Me) => React.ReactNode }) {
  const { account, me, data } = useHome();
  return (
    <Screen
      onRefresh={() => void me.refetch()}
      refreshing={me.isRefetching}
      header={<HomeHeader name={data?.profile.name ?? account.name} sub={data ? sub(data) : ''} school={account.school.name} />}>
      {data ? (
        <>
          <Freshness updatedAt={me.dataUpdatedAt} error={me.error} />
          {children(data)}
        </>
      ) : me.error ? (
        <Banner tone="bad">{(me.error as Error).message}</Banner>
      ) : (
        <Loading />
      )}
    </Screen>
  );
}

function ChildCard({ child }: { child: Child }) {
  const c = usePalette();
  const photo = mediaUrl(child.photo_url);
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      {photo ? (
        <Image source={photo} style={{ width: 52, height: 52, borderRadius: 26 }} accessibilityLabel={child.name} />
      ) : (
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: c.blueTint,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <T style={{ fontFamily: font.heavy, fontSize: 17, color: c.blueText }}>{initials(child.name)}</T>
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="heading">{child.name}</T>
        <T v="small" tone="quiet">
          {[child.class_name, child.roll_no ? `Roll ${child.roll_no}` : null].filter(Boolean).join(' · ')}
        </T>
      </View>
    </Card>
  );
}

export function ParentHome() {
  return (
    <Shell
      sub={(me) => (me.children?.length === 1 ? 'Parent of 1 student' : `Parent of ${me.children?.length ?? 0} students`)}>
      {(me) => (
        <>
          <SectionLabel>{me.children && me.children.length > 1 ? 'Your children' : 'Your child'}</SectionLabel>
          {(me.children ?? []).map((child) => (
            <ChildCard key={child.id} child={child} />
          ))}
          <NextUp text="Attendance, fees, homework and results for each child arrive in the next update of the app." />
        </>
      )}
    </Shell>
  );
}

export function StudentHome() {
  return (
    <Shell sub={(me) => [me.profile.class_name, me.profile.roll_no ? `Roll ${me.profile.roll_no}` : null].filter(Boolean).join(' · ')}>
      {(me) => (
        <>
          <Card>
            <Detail label="Class" value={me.profile.class_name} />
            <Divider />
            <Detail label="Roll no." value={me.profile.roll_no} />
            <Divider />
            <Detail label="Username" value={me.profile.username} />
          </Card>
          <NextUp text="Attendance, homework, results and fees arrive in the next update of the app." />
        </>
      )}
    </Shell>
  );
}

const ACCESS: Record<number, string> = {
  1501: 'Take attendance',
  1502: 'Change attendance',
  1503: 'See attendance',
  1504: 'See attendance reports',
  1651: 'Publish notices',
  1652: 'Manage notices',
};

export function StaffHome() {
  return (
    <Shell sub={(me) => me.profile.designation || 'Staff'}>
      {(me) => {
        const access = [...new Set((me.permissions ?? []).map((p) => ACCESS[p]).filter(Boolean))];
        return (
          <>
            <Card>
              <Detail label="Designation" value={me.profile.designation} />
              <Divider />
              <Detail label="Username" value={me.profile.username} />
            </Card>
            {access.length ? (
              <>
                <SectionLabel>What you can do in the app</SectionLabel>
                <Card>
                  {access.map((line, i) => (
                    <View key={line} style={{ gap: space.md }}>
                      {i ? <Divider /> : null}
                      <T>{line}</T>
                    </View>
                  ))}
                </Card>
              </>
            ) : null}
            <NextUp text="Your classes, attendance and homework arrive in the next updates of the app." />
          </>
        );
      }}
    </Shell>
  );
}

export function AdminHome() {
  return (
    <Shell sub={() => 'School admin'}>
      {(me) => (
        <>
          <Card>
            <Detail label="School" value={me.school.name} />
            <Divider />
            <Detail label="Address" value={me.school.address} />
            <Divider />
            <Detail label="School code" value={me.school.code} />
            <Divider />
            <Detail label="Username" value={me.profile.username} />
          </Card>
          <NextUp text="The dashboard, students, fees and staff arrive in the next updates of the app." />
        </>
      )}
    </Shell>
  );
}

function NextUp({ text }: { text: string }) {
  const c = usePalette();
  return (
    <View style={{ padding: space.lg, borderRadius: radius.card, borderWidth: 1, borderColor: c.line, borderStyle: 'dashed' }}>
      <T v="small" tone="quiet">
        {text}
      </T>
    </View>
  );
}
