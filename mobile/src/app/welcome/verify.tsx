import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { device, useAccounts } from '@/accounts/store';
import { ApiError, publicApi } from '@/api/client';
import type { CodeSent, SignedIn } from '@/api/types';
import { space } from '@/theme';
import { Banner, Button, Card, Field, Header, Screen, T } from '@/ui/kit';

const RESEND_SECONDS = 60;

export default function VerifyCode() {
  const { code: schoolCode = '', email = '', mode = 'signin' } = useLocalSearchParams<{
    code: string;
    email: string;
    mode: 'signin' | 'family';
  }>();
  const { signedIn } = useAccounts();
  const [digits, setDigits] = useState('');
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
    if (!/^\d{6}$/.test(digits)) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const answer = await publicApi<SignedIn>('auth/parent/verify', {
        method: 'POST',
        body: { school_code: schoolCode, email, code: digits, device: device() },
      });
      await signedIn(answer);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That code did not work.');
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    setInfo(null);
    try {
      await publicApi<CodeSent>('auth/parent/code', { method: 'POST', body: { school_code: schoolCode, email } });
      setInfo('A new code is on its way.');
      setWait(RESEND_SECONDS);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The code could not be sent.');
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        header={
          <Header onBack={() => router.back()}>
            <View style={{ gap: space.xs }}>
              <T v="title" tone="onHeader">
                Check your email
              </T>
              <T tone="onHeaderSoft">
                {mode === 'family'
                  ? `We sent a 6-digit code to ${email}. It works for 10 minutes.`
                  : `If the school has ${email} for you, a 6-digit code is on its way. It works for 10 minutes.`}
              </T>
            </View>
          </Header>
        }>
        {error ? <Banner tone="bad">{error}</Banner> : null}
        {info ? <Banner tone="ok">{info}</Banner> : null}
        <Card>
          <Field
            label="Code"
            value={digits}
            onChangeText={(text) => setDigits(text.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            returnKeyType="go"
            onSubmitEditing={verify}
            style={{ fontSize: 22, letterSpacing: 6 }}
          />
          <Button title="Sign in" onPress={verify} busy={busy} />
          {mode === 'signin' ? (
            <Button
              title={wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
              kind="quiet"
              disabled={wait > 0}
              onPress={resend}
            />
          ) : null}
        </Card>
        {mode === 'signin' ? (
          <T v="small" tone="quiet">
            No email after a few minutes? Check spam. If the school doesn’t have this address, no code is sent: ask
            the school office for a family code instead.
          </T>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
