import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { ApiError, publicApi } from '@/api/client';
import { useSchool } from '@/api/hooks';
import type { CodeSent } from '@/api/types';
import { space } from '@/theme';
import { SchoolCard } from '@/ui/SchoolCard';
import { Banner, Button, Card, Field, Header, Screen, T } from '@/ui/kit';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function ParentEmail() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  const school = useSchool(code).data?.school;
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const clean = email.trim().toLowerCase();
    if (!EMAIL.test(clean)) {
      setError('Enter your email address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await publicApi<CodeSent>('auth/parent/code', { method: 'POST', body: { school_code: code, email: clean } });
      router.push({ pathname: '/welcome/verify', params: { code, email: clean, mode: 'signin' } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The code could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen
        header={
          <Header onBack={() => router.back()}>
            <View style={{ gap: space.xs }}>
              <T v="title" tone="onHeader">
                Sign in as a parent
              </T>
              <T tone="onHeaderSoft">We email a 6-digit code to the address the school has for you.</T>
            </View>
          </Header>
        }>
        {school ? <SchoolCard name={school.name} address={school.address} logo={school.logo_url} /> : null}
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <Card>
          <Field
            label="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={send}
          />
          <Button title="Email me a code" icon="mail" onPress={send} busy={busy} />
        </Card>
        <Card>
          <T v="bodyStrong">The school doesn’t have my email</T>
          <T v="small" tone="quiet">
            Ask your child to make a family code in their app (Account → Invite my parent), or ask the school
            office for one. You use it once, with your email, and after that your email is enough.
          </T>
          <Button
            title="I have a family code"
            kind="secondary"
            icon="key"
            onPress={() => router.push({ pathname: '/welcome/family-code', params: { code } })}
          />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
