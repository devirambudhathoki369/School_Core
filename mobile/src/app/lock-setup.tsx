import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';

import { useLock } from '@/lock/store';
import { space, usePalette } from '@/theme';
import { Banner, Button, Card, Header, ListRow, Screen, T } from '@/ui/kit';
import { PinPad } from '@/ui/PinPad';

type Step = 'choose' | 'confirm' | 'finish';

export default function LockSetup() {
  const c = usePalette();
  const lock = useLock();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const fromSettings = from === 'settings';
  const [step, setStep] = useState<Step>('choose');
  const [first, setFirst] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [biometrics, setBiometrics] = useState(lock.biometricsAvailable);
  const [busy, setBusy] = useState(false);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  async function finish() {
    setBusy(true);
    await lock.setPin(first, biometrics);
    setBusy(false);
    // This screen stays allowed once a PIN exists, so no guard moves the user
    // on: back to settings, or on to the role's home through the index.
    if (fromSettings) close();
    else router.replace('/');
  }

  return (
    <Screen
      header={
        <Header onBack={fromSettings ? close : undefined}>
          <View style={{ gap: space.xs }}>
            <T v="title" tone="onHeader">
              {lock.hasPin && fromSettings ? 'Change the app lock' : 'Set an app lock'}
            </T>
            <T tone="onHeaderSoft">
              {lock.required
                ? 'Staff and admin accounts hold school records, so this phone needs a PIN before they open.'
                : 'A PIN keeps your child’s records private if someone else picks up the phone.'}
            </T>
          </View>
        </Header>
      }>
      {error ? <Banner tone="bad">{error}</Banner> : null}

      {step === 'choose' || step === 'confirm' ? (
        <Card style={{ alignItems: 'center', paddingVertical: space.xxl }}>
          <T v="heading" center>
            {step === 'choose' ? 'Choose a 6-digit PIN' : 'Type the PIN again'}
          </T>
          <PinPad
            resetKey={reset}
            onComplete={(pin) => {
              if (step === 'choose') {
                if (/^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
                  setError('Pick a PIN that is harder to guess than a repeat or a run of digits.');
                  setReset((n) => n + 1);
                  return;
                }
                setFirst(pin);
                setError(null);
                setStep('confirm');
                setReset((n) => n + 1);
              } else if (pin === first) {
                setError(null);
                setStep('finish');
              } else {
                setError('The two PINs were not the same. Choose again.');
                setFirst('');
                setStep('choose');
                setReset((n) => n + 1);
              }
            }}
          />
        </Card>
      ) : (
        <>
          {lock.biometricsAvailable ? (
            <Card padded={false}>
              <ListRow
                icon="fingerprint"
                title="Also unlock with fingerprint or face"
                trailing={
                  <Switch
                    value={biometrics}
                    onValueChange={setBiometrics}
                    trackColor={{ true: c.blue, false: c.lineStrong }}
                    accessibilityLabel="Also unlock with fingerprint or face"
                  />
                }
              />
            </Card>
          ) : null}
          <Button title="Turn on the app lock" icon="lock" onPress={finish} busy={busy} />
        </>
      )}

      {fromSettings && lock.hasPin && !lock.required ? (
        <Button
          title="Turn the app lock off"
          kind="danger"
          icon="unlock"
          onPress={async () => {
            await lock.removePin();
            close();
          }}
        />
      ) : null}
      <T v="small" tone="quiet" center>
        The PIN stays on this phone. Five wrong tries sign every account off it.
      </T>
    </Screen>
  );
}
