import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Alert, Platform, View } from 'react-native';

import { useMe } from '@/api/queries';
import { useSession } from '@/auth/session';
import { titleCase } from '@/lib/format';
import { Button, Card, Divider, ListItem, PageTitle, Screen, T } from '@/ui/kit';
import { space } from '@/ui/theme';

export default function More() {
  const { me } = useMe();
  const { signOut } = useSession();

  function confirmSignOut() {
    if (Platform.OS === 'web') {
      void signOut();
      return;
    }
    Alert.alert('Sign out?', 'You will need your username and password to sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  return (
    <Screen>
      <PageTitle title="More" />
      {me ? (
        <Card style={{ padding: 0, gap: 0 }}>
          <ListItem
            icon="user"
            title={titleCase(me.profile.name)}
            sub={[me.className, me.profile.school_name].filter(Boolean).join(' · ')}
            onPress={() => router.push('/profile')}
          />
        </Card>
      ) : null}
      <Card style={{ padding: 0, gap: 0 }}>
        <ListItem icon="award" title="Exam results" sub="Published marks by exam" onPress={() => router.push('/results')} />
        <Divider />
        <ListItem icon="bell" title="Notices" sub="From the school" onPress={() => router.push('/notices')} />
        <Divider />
        <ListItem
          icon="calendar"
          title="School calendar"
          sub="Holidays, exams and events"
          onPress={() => router.push('/calendar')}
        />
      </Card>
      <Button title="Sign out" kind="secondary" icon="log-out" onPress={confirmSignOut} />
      <View style={{ alignItems: 'center', gap: space.xs }}>
        <T v="small" tone="muted">
          SchoolCore {Constants.expoConfig?.version ?? ''}
        </T>
      </View>
    </Screen>
  );
}
