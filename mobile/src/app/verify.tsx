import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { api } from '@/api/client';
import { Banner, Button, Card, Field, Screen, T } from '@/ui/kit';
import { space } from '@/ui/theme';

const RESEND_SECONDS = 60;

export default function Verify() {
  const { username = '', contact = '' } = useLocalSearchParams<{ username?: string; contact?: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [wait, setWait] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function verify() {
    if (!/^\d{4,8}$/.test(code.trim())) {
      setError('Enter the code from the SMS.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/auth/otp/verify', { method: 'POST', auth: false, body: { username, otp: code.trim() } });
      router.replace({ pathname: '/sign-in', params: { ready: '1', username } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setInfo(null);
    try {
      await api('/auth/otp/resend', { auth: false, params: { username, contact } });
      setInfo('A new code is on its way.');
      setWait(RESEND_SECONDS);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The code could not be sent.');
    }
  }

  const masked = contact ? `${'•'.repeat(Math.max(contact.length - 3, 0))}${contact.slice(-3)}` : 'your phone';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']} contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <View style={{ gap: space.xs }}>
          <T v="title">Enter the code</T>
          <T tone="muted">We sent a code by SMS to {masked}. It works for a few minutes.</T>
        </View>

        {error ? <Banner tone="bad">{error}</Banner> : null}
        {info ? <Banner tone="ok">{info}</Banner> : null}

        <Card>
          <Field
            label="Code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="sms-otp"
            textContentType="oneTimeCode"
            maxLength={8}
            returnKeyType="go"
            onSubmitEditing={verify}
          />
          <Button title="Verify" onPress={verify} busy={busy} />
          <Button
            title={wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
            kind="quiet"
            disabled={wait > 0}
            onPress={resend}
          />
        </Card>
        <Button title="Back to sign in" kind="quiet" onPress={() => router.replace('/sign-in')} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
