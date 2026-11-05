import { router } from 'expo-router';
import { Alert, Platform, Switch, View } from 'react-native';

import { accountLine, useAccounts, useActive } from '@/accounts/store';
import { APP_VERSION } from '@/api/client';
import { useMe } from '@/api/hooks';
import { useLock } from '@/lock/store';
import { space, usePalette } from '@/theme';
import { Icon } from '@/ui/Icon';
import { Card, Divider, Header, ListRow, Screen, SectionLabel, T } from '@/ui/kit';

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

export function MoreScreen() {
  const c = usePalette();
  const account = useActive();
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
      <T v="small" tone="quiet" center>
        {`SchoolCore ${APP_VERSION}`}
      </T>
    </Screen>
  );
}
