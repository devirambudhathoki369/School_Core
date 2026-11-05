import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { font, radius, space, usePalette } from '@/theme';
import { Icon } from './Icon';

export const PIN_LENGTH = 6;

/** Six boxes and a number pad. `onDark` draws it on the navy lock screen. */
export function PinPad({
  onComplete,
  onBiometrics,
  onDark = false,
  resetKey,
}: {
  onComplete: (pin: string) => void;
  onBiometrics?: () => void;
  onDark?: boolean;
  /** Change it to clear what was typed (after a wrong PIN). */
  resetKey?: number;
}) {
  const c = usePalette();
  const [pin, setPin] = useState('');
  // A new resetKey clears what was typed, during render rather than in an effect.
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setPin('');
  }

  const ink = onDark ? c.onHeader : c.text;
  const edge = onDark ? c.onHeaderEdge : c.lineStrong;
  const filled = onDark ? c.marigold : c.blue;

  function press(digit: string) {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === PIN_LENGTH) setTimeout(() => onComplete(next), 80);
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'];
  return (
    <View style={{ gap: space.xxl, alignItems: 'center' }}>
      <View style={styles.boxes} accessibilityLabel={`${pin.length} of ${PIN_LENGTH} digits entered`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View
            key={i}
            style={[
              styles.box,
              { borderColor: i < pin.length ? filled : edge, backgroundColor: i < pin.length ? filled : 'transparent' },
            ]}
          />
        ))}
      </View>
      <View style={styles.pad}>
        {keys.map((key) => {
          if (key === 'bio') {
            return onBiometrics ? (
              <Pressable
                key={key}
                onPress={onBiometrics}
                accessibilityRole="button"
                accessibilityLabel="Unlock with fingerprint or face"
                style={({ pressed }) => [styles.key, pressed && { opacity: 0.6 }]}>
                <Icon name="fingerprint" size={28} color={ink} />
              </Pressable>
            ) : (
              <View key={key} style={styles.key} />
            );
          }
          if (key === 'del') {
            return (
              <Pressable
                key={key}
                onPress={() => setPin((p) => p.slice(0, -1))}
                accessibilityRole="button"
                accessibilityLabel="Delete"
                style={({ pressed }) => [styles.key, pressed && { opacity: 0.6 }]}>
                <Icon name="backspace" size={26} color={ink} />
              </Pressable>
            );
          }
          return (
            <Pressable
              key={key}
              onPress={() => press(key)}
              accessibilityRole="button"
              accessibilityLabel={key}
              style={({ pressed }) => [
                styles.key,
                { borderColor: edge, borderWidth: 1 },
                pressed && { backgroundColor: onDark ? c.onHeaderEdge : c.blueTint },
              ]}>
              <Text style={{ fontFamily: font.bold, fontSize: 26, color: ink }}>{key}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', gap: 10 },
  box: { width: 22, height: 28, borderRadius: 6, borderWidth: 2 },
  pad: { width: 264, flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' },
  key: { width: 72, height: 60, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
});
