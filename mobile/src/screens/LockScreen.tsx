import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccounts } from '@/accounts/store';
import { MAX_PIN_FAILURES, useLock } from '@/lock/store';
import { Mark } from '@/ui/Mark';
import { T } from '@/ui/kit';
import { PinPad } from '@/ui/PinPad';
import { space, usePalette } from '@/theme';

/** Shown over everything while the app is locked. */
export function LockScreen() {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const { active } = useAccounts();
  const lock = useLock();
  const [message, setMessage] = useState<string | null>(null);
  const [reset, setReset] = useState(0);

  useEffect(() => {
    if (lock.biometricsOn) void lock.unlockWithBiometrics();
    // only on first show
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryPin(pin: string) {
    const result = await lock.unlockWithPin(pin);
    if (result === 'wrong') {
      const left = MAX_PIN_FAILURES - lock.failures - 1;
      setMessage(
        left > 0
          ? `That PIN is not right. ${left} ${left === 1 ? 'try' : 'tries'} left before this phone is signed out.`
          : 'That PIN is not right.',
      );
      setReset((n) => n + 1);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.header,
        paddingTop: insets.top + space.xxxl,
        paddingBottom: insets.bottom + space.xl,
        paddingHorizontal: space.xl,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
      <View style={{ alignItems: 'center', gap: space.md }}>
        <Mark size={52} onDark />
        <T v="title" tone="onHeader" center>
          Enter your PIN
        </T>
        <T tone="onHeaderSoft" center>
          {active ? `${active.name} · ${active.school.name}` : 'SchoolCore'}
        </T>
        {message ? (
          <T v="smallStrong" center style={{ color: c.marigold, maxWidth: 300 }}>
            {message}
          </T>
        ) : null}
      </View>
      <PinPad
        onDark
        resetKey={reset}
        onComplete={tryPin}
        onBiometrics={lock.biometricsOn ? () => void lock.unlockWithBiometrics() : undefined}
      />
    </View>
  );
}
