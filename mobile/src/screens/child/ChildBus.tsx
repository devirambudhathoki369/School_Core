import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';

import { useActive } from '@/accounts/store';
import { useApi, useWrite } from '@/api/hooks';
import type { Bus, StudentBus } from '@/api/types';
import { ago } from '@/lib/format';
import { space } from '@/theme';
import { Banner, Button, Card, Divider, ListRow, Screen, SectionLabel, T } from '@/ui/kit';
import { Chip, Empty, Loaded, type Tone } from '@/ui/parts';
import { PageHeader } from '../parts';
import { useChild } from './context';

// Colour keeps its one meaning (SPEC §7): green for a bus on its way, amber
// for one the school cannot see right now, plain for a bus standing still.
const TONE: Record<string, Tone> = {
  Moving: 'ok',
  Idling: 'quiet',
  Stopped: 'quiet',
  'No signal': 'warn',
  Offline: 'warn',
  'Tracking unavailable': 'warn',
};

/** Where the bus is now, in words. */
function whereLine(bus: Bus): string {
  const parts = [
    bus.status === 'Moving' && bus.speed_kmh ? `${Math.round(bus.speed_kmh)} km/h` : null,
    bus.updated_at ? `Seen ${ago(bus.updated_at)}` : 'No position yet',
  ];
  return parts.filter(Boolean).join(' · ');
}

function openMap(bus: Bus) {
  if (bus.latitude == null || bus.longitude == null) return;
  const at = `${bus.latitude},${bus.longitude}`;
  void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(at)}`).catch(() =>
    undefined,
  );
}

/** The school bus the student rides, live, and the school's other buses to
 *  choose from. For the student, and for their parent. */
export function BusScreen() {
  const account = useActive();
  const { child } = useChild();
  const write = useWrite();
  const path = child ? `students/${child.id}/bus` : null;
  const bus = useApi<StudentBus>(path, {
    // where a bus is goes stale in seconds: always asked afresh on opening,
    // then again while this screen is open and the app is in front
    staleTime: 0,
    refetchEvery: (data) => (data?.refresh_seconds ?? 15) * 1000,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parent = account.role === 'parent';
  const firstName = child?.name.split(' ')[0] ?? '';
  const whose = parent ? `${firstName}’s bus` : 'Your bus';

  async function ride(busId: number | null) {
    if (!path) return;
    setBusy(true);
    setError(null);
    try {
      await write<StudentBus>(path, 'PUT', { bus_id: busId });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function confirmRide(choice: Bus) {
    Alert.alert(
      parent ? `Does ${firstName} ride ${choice.name}?` : `Do you ride ${choice.name}?`,
      'It shows first here, and you can change it any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, this bus', onPress: () => void ride(choice.id) },
      ],
    );
  }

  function confirmNoBus() {
    Alert.alert(parent ? `${firstName} doesn’t ride a school bus?` : 'You don’t ride a school bus?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'That’s right', onPress: () => void ride(null) },
    ]);
  }

  return (
    <Screen
      onRefresh={() => void bus.refetch()}
      refreshing={bus.isRefetching}
      header={<PageHeader title="School bus" sub={child?.name} />}>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Loaded
        query={bus}
        empty={(data) =>
          data.buses.length ? null : (
            <Empty icon="bus" title="No buses to show" body={data.message ?? 'The school has no buses on tracking yet.'} />
          )
        }>
        {(data) => {
          const mine = data.buses.find((b) => b.id === data.following) ?? null;
          const others = data.buses.filter((b) => b.id !== data.following);
          return (
            <>
              {data.message ? <Banner tone="warn">{data.message}</Banner> : null}
              {mine ? (
                <>
                  <SectionLabel>{whose}</SectionLabel>
                  <Card>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                      <T v="title" style={{ flex: 1 }}>
                        {mine.name}
                      </T>
                      <Chip label={mine.status} tone={TONE[mine.status] ?? 'quiet'} />
                    </View>
                    {mine.address ? <T>{mine.address}</T> : null}
                    <T v="small" tone="quiet">
                      {whereLine(mine)}
                    </T>
                    {mine.stale && mine.latitude != null ? (
                      <T v="small" tone="quiet">
                        This is where the bus was last seen, not where it is now.
                      </T>
                    ) : null}
                    {mine.latitude != null ? (
                      <Button title="Open in Maps" kind="secondary" icon="map-pin" onPress={() => openMap(mine)} />
                    ) : null}
                  </Card>
                </>
              ) : (
                <Card>
                  <T v="bodyStrong">{parent ? `Which bus does ${firstName} ride?` : 'Which bus do you ride?'}</T>
                  <T v="small" tone="soft">
                    Choose it below. It then shows first, with where it is now.
                  </T>
                </Card>
              )}
              {others.length ? (
                <>
                  <SectionLabel>{mine ? 'Other school buses' : 'School buses'}</SectionLabel>
                  <Card padded={false}>
                    {others.map((other, i) => (
                      <View key={other.id}>
                        {i ? <Divider inset={70} /> : null}
                        <ListRow
                          icon="bus"
                          tint={other.status === 'Moving' ? 'ok' : 'blue'}
                          title={other.name}
                          sub={`${other.status} · ${whereLine(other)}`}
                          onPress={busy ? undefined : () => confirmRide(other)}
                          accessibilityLabel={`${other.name}, ${other.status}. Choose this bus.`}
                        />
                      </View>
                    ))}
                  </Card>
                </>
              ) : null}
              {mine ? <Button title="No school bus" kind="quiet" busy={busy} onPress={confirmNoBus} /> : null}
            </>
          );
        }}
      </Loaded>
    </Screen>
  );
}
