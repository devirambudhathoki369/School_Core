import { Image } from 'expo-image';
import { Linking, View } from 'react-native';

import { mediaUrl } from '@/api/client';
import { useMe } from '@/api/queries';
import { titleCase } from '@/lib/format';
import { Button, Card, Failed, Loading, Row, Screen, SectionLabel, T } from '@/ui/kit';
import { font, usePalette } from '@/ui/theme';

export default function Profile() {
  const c = usePalette();
  const { me, isLoading, error, refetch } = useMe();

  if (isLoading) return <Screen edges={[]}><Loading /></Screen>;
  if (!me) return <Screen edges={[]}><Failed error={error} onRetry={() => refetch()} /></Screen>;

  const p = me.profile;
  const r = me.record;
  const photo = mediaUrl(r?.image ?? p.image);
  const name = titleCase(p.name);
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  const phone = p.school_contact || p.school_telephone;

  return (
    <Screen edges={[]} onRefresh={() => refetch()}>
      <Card style={{ alignItems: 'center' }}>
        {photo ? (
          <Image source={photo} style={{ width: 88, height: 88, borderRadius: 44 }} accessibilityLabel={name} />
        ) : (
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: c.brandTint,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <T style={{ fontFamily: font.display, fontSize: 32, lineHeight: 38, color: c.brandInk }}>{initials}</T>
          </View>
        )}
        <View style={{ alignItems: 'center', gap: 2 }}>
          <T v="heading">{name}</T>
          <T tone="muted">{me.className ?? ''}</T>
        </View>
      </Card>

      <SectionLabel>Student</SectionLabel>
      <Card>
        <Row label="Student ID" value={String(p.id)} />
        {r?.roll_no ? <Row label="Roll no." value={r.roll_no} /> : null}
        {r?.regd_no ? <Row label="Registration no." value={r.regd_no} /> : null}
        {r?.symbol_no ? <Row label="Symbol no." value={r.symbol_no} /> : null}
        {p.location ? <Row label="Address" value={p.location} /> : null}
      </Card>

      <SectionLabel>Family</SectionLabel>
      <Card>
        {p.father_name ? <Row label="Father" value={titleCase(p.father_name)} /> : null}
        {p.mother_name ? <Row label="Mother" value={titleCase(p.mother_name)} /> : null}
        {p.guardian_name ? <Row label="Guardian" value={titleCase(p.guardian_name)} /> : null}
        {p.guardian_contact ? <Row label="Phone on record" value={p.guardian_contact} /> : null}
      </Card>

      <SectionLabel>School</SectionLabel>
      <Card>
        <T v="bodyStrong">{p.school_name}</T>
        {p.school_address ? <T tone="muted">{p.school_address}</T> : null}
        {p.school_email ? <Row label="Email" value={p.school_email} /> : null}
        {phone ? (
          <Button title={`Call the school · ${phone}`} kind="secondary" icon="phone" onPress={() => Linking.openURL(`tel:${phone}`)} />
        ) : null}
      </Card>
    </Screen>
  );
}
