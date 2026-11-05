import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { mediaUrl } from '@/api/client';
import { font, radius, space, usePalette } from '@/theme';
import { T } from './kit';

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

export function SchoolBadge({ name, logo, size = 44 }: { name: string; logo?: string | null; size?: number }) {
  const c = usePalette();
  const uri = mediaUrl(logo);
  if (uri) {
    return (
      <Image
        source={uri}
        style={{ width: size, height: size, borderRadius: 12, backgroundColor: c.cardAlt }}
        contentFit="contain"
        accessibilityLabel={`${name} logo`}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        backgroundColor: c.blueTint,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <T style={{ fontFamily: font.heavy, fontSize: size * 0.36, color: c.blueText }}>{initials(name) || 'S'}</T>
    </View>
  );
}

export function SchoolCard({
  name,
  address,
  logo,
  action,
}: {
  name: string;
  address?: string;
  logo?: string | null;
  action?: ReactNode;
}) {
  const c = usePalette();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        padding: space.md + 2,
        backgroundColor: c.card,
        borderColor: c.line,
        borderWidth: 1,
        borderRadius: radius.card,
      }}>
      <SchoolBadge name={name} logo={logo} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyStrong">{name}</T>
        {address ? (
          <T v="small" tone="quiet">
            {address}
          </T>
        ) : null}
      </View>
      {action}
    </View>
  );
}
