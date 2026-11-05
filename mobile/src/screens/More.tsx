import { router } from 'expo-router';
import { Alert, Platform, Switch, View } from 'react-native';

import { accountLine, useAccounts, useActive } from '@/accounts/store';
import { api, APP_VERSION } from '@/api/client';
import { useMe } from '@/api/hooks';
import { useLock } from '@/lock/store';
import { space, usePalette } from '@/theme';
import { Icon, type IconName } from '@/ui/Icon';
import { Card, Divider, Header, ListRow, Screen, SectionLabel, T } from '@/ui/kit';
import { useGo } from './nav';

function confirm(title: string, body: string, action: string, run: () => void) {
  if (Platform.OS === 'web') {
    run();
    return;
  }
  Alert.alert(title, body, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: 'destructive', onPress: run },
  ]);
}

const LINKS: Record<string, [IconName, string, string][]> = {
  parent: [
    ['award', 'Results', '/results'],
    ['clock', 'Timetable', '/timetable'],
    ['receipt', 'Bills and payments', '/fees-history'],
    ['bell', 'Notices', '/notices'],
    ['sun', 'School calendar', '/calendar'],
  ],
  student: [
    ['wallet', 'Fees', '/fees'],
    ['clock', 'Timetable', '/timetable'],
    ['bell', 'Notices', '/notices'],
    ['sun', 'School calendar', '/calendar'],
  ],
  staff: [
    ['calendar', 'My attendance', '/my-attendance'],
    ['sun', 'School calendar', '/calendar'],
  ],
  admin: [
    ['parent', 'Parents to review', '/parents'],
    ['wallet', 'Money received', '/collections'],
    ['bell', 'Notices', '/notices'],
    ['sun', 'School calendar', '/calendar'],
  ],
};

export function MoreScreen() {
  const c = usePalette();
  const account = useActive();
  const go = useGo();
  const { accounts, switchTo, setAdding, signOut, signOutEverywhere } = useAccounts();
  const lock = useLock();
  const me = useMe().data;

  const lockLine = lock.hasPin
    ? lock.biometricsOn
      ? 'On: PIN, fingerprint or face'
      : 'On: PIN'
    : lock.required
      ? 'Required for staff and admin accounts'
      : 'Off';

  return (
    <Screen
      header={
        <Header>
          <View style={{ gap: space.xs }}>
            <T v="title" tone="onHeader">
              {me?.profile.name ?? account.name}
            </T>
            <T tone="onHeaderSoft">{accountLine(account)}</T>
          </View>
        </Header>
      }>
      <Card padded={false}>
        {LINKS[account.role].map(([icon, title, path], i) => (
          <View key={path}>
            {i ? <Divider inset={70} /> : null}
            <ListRow icon={icon} title={title} onPress={() => go(path)} />
          </View>
        ))}
      </Card>

      <SectionLabel>Accounts on this phone</SectionLabel>
      <Card padded={false}>
        {accounts.map((other, i) => (
          <View key={other.id}>
            {i ? <Divider inset={70} /> : null}
            <ListRow
              icon={other.role === 'parent' ? 'parent' : other.role === 'student' ? 'student' : other.role === 'staff' ? 'staff' : 'admin'}
              tint={other.id === account.id ? 'blue' : 'marigold'}
              title={other.name}
              sub={accountLine(other)}
              onPress={other.id === account.id ? undefined : () => switchTo(other.id)}
              accessibilityLabel={`Switch to ${other.name}`}
              trailing={other.id === account.id ? <Icon name="check" size={20} color={c.blueText} /> : undefined}
            />
          </View>
        ))}
        <Divider inset={70} />
        <ListRow icon="plus" title="Add another account" sub="A child at another school, or your staff login" onPress={() => setAdding(true)} />
      </Card>

      <SectionLabel>Security</SectionLabel>
      <Card padded={false}>
        <ListRow icon="lock" title="App lock" sub={lockLine} onPress={() => router.push({ pathname: '/lock-setup', params: { from: 'settings' } })} />
        {lock.hasPin && lock.biometricsAvailable ? (
          <>
            <Divider inset={70} />
            <ListRow
              icon="fingerprint"
              title="Unlock with fingerprint or face"
              trailing={
                <Switch
                  value={lock.biometricsOn}
                  onValueChange={(on) => void lock.setBiometrics(on)}
                  trackColor={{ true: c.blue, false: c.lineStrong }}
                  accessibilityLabel="Unlock with fingerprint or face"
                />
              }
            />
          </>
        ) : null}
        <Divider inset={70} />
        <ListRow icon="phone" title="Phones signed in" sub="See them, and sign one out" onPress={() => router.push('/sessions')} />
      </Card>

      <Card padded={false}>
        <ListRow
          icon="logout"
          tint="bad"
          title="Sign out on this phone"
          onPress={() =>
            confirm('Sign out?', `${account.name} will be signed out on this phone.`, 'Sign out', () => void signOut(account.id))
          }
        />
        <Divider inset={70} />
        <ListRow
          icon="logout"
          tint="bad"
          title="Sign out on every phone"
          onPress={() =>
            confirm(
              'Sign out everywhere?',
              `${account.name} will be signed out on every phone, this one too.`,
              'Sign out everywhere',
              () => void signOutEverywhere(account.id),
            )
          }
        />
      </Card>
      {account.role !== 'admin' ? (
        <Card padded={false}>
          <ListRow
            icon="x"
            tint="bad"
            title="Close my account"
            sub="Stops sign-in for good. The school keeps its records."
            onPress={() =>
              confirm(
                'Close your account?',
                account.role === 'parent'
                  ? 'You will be signed out on every phone. To come back, ask the school for a family code.'
                  : 'Your sign-in stops working on every phone and in the portal. The school office can open it again.',
                'Close account',
                () =>
                  void api(account.id, 'me/close-account', { method: 'POST', body: { confirm: true } })
                    .then(() => signOut(account.id))
                    .catch(() => undefined),
              )
            }
          />
        </Card>
      ) : null}
      <T v="small" tone="quiet" center>
        {`SchoolCore ${APP_VERSION}`}
      </T>
    </Screen>
  );
}
