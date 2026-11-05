import { Text, View } from 'react-native';

import { font, usePalette } from '@/theme';

/** The SchoolCore mark: a marigold square with a navy S (on navy), or a
 *  navy square with a marigold S (on light ground). */
export function Mark({ size = 40, onDark = false }: { size?: number; onDark?: boolean }) {
  const c = usePalette();
  return (
    <View
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: onDark ? c.marigold : c.header,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text
        style={{
          fontFamily: font.heavy,
          fontSize: size * 0.56,
          lineHeight: size * 0.72,
          color: onDark ? c.onMarigold : c.marigold,
        }}>
        S
      </Text>
    </View>
  );
}

export function Wordmark({ onDark = false }: { onDark?: boolean }) {
  const c = usePalette();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Mark size={34} onDark={onDark} />
      <Text style={{ fontFamily: font.heavy, fontSize: 20, color: onDark ? c.onHeader : c.text, letterSpacing: -0.2 }}>
        SchoolCore
      </Text>
    </View>
  );
}
