import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { View } from 'react-native';

import { useActive } from '@/accounts/store';
import { api } from '@/api/client';
import { usePhones } from '@/api/hooks';
import { space, usePalette } from '@/theme';
import { Banner, Button, Card, Divider, Header, ListRow, Loading, Screen, T } from '@/ui/kit';

function when(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Sessions() {
  const c = usePalette();
  const account = useActive();
  const phones = usePhones();
  const queryClient = useQueryClient();

  async function signOutPhone(id: string) {
    await api(account.id, `me/sessions/${id}`, { method: 'DELETE' }).catch(() => undefined);
    await queryClient.invalidateQueries({ queryKey: [account.id, 'me/sessions'] });
  }

  const items = phones.data?.items ?? [];
  return (
    <Screen
      onRefresh={() => void phones.refetch()}
      refreshing={phones.isRefetching}
      header={
        <Header onBack={() => router.back()}>
          <View style={{ gap: space.xs }}>
            <T v="title" tone="onHeader">
              Phones signed in
            </T>
            <T tone="onHeaderSoft">{`${account.name} is signed in on these phones. Up to five at a time.`}</T>
          </View>
        </Header>
      }>
      {phones.isLoading ? <Loading /> : null}
      {phones.error ? <Banner tone="bad">{(phones.error as Error).message}</Banner> : null}
      {items.length ? (
        <Card padded={false}>
          {items.map((phone, i) => (
            <View key={phone.id}>
              {i ? <Divider inset={70} /> : null}
              <ListRow
                icon="phone"
                tint={phone.current ? 'blue' : 'marigold'}
                title={phone.device_label || (phone.platform === 'ios' ? 'iPhone' : 'Android phone')}
                sub={`${phone.current ? 'This phone · ' : ''}last used ${when(phone.last_seen_at)} · app ${phone.app_version}`}
                trailing={
                  phone.current ? undefined : (
                    <View style={{ width: 104 }}>
                      <Button title="Sign out" kind="danger" onPress={() => void signOutPhone(phone.id)} />
                    </View>
                  )
                }
              />
            </View>
          ))}
        </Card>
      ) : null}
      <T v="small" tone="quiet" style={{ color: c.textQuiet }}>
        Don’t recognise a phone? Sign it out, then change your password at the school office.
      </T>
    </Screen>
  );
}
