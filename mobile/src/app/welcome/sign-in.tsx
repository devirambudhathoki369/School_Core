import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { device, useAccounts } from '@/accounts/store';
import { ApiError, publicApi } from '@/api/client';
import { useSchool } from '@/api/hooks';
import type { SignedIn } from '@/api/types';
import { space } from '@/theme';
import { SchoolCard } from '@/ui/SchoolCard';
import { Banner, Button, Card, Field, Header, Screen, T } from '@/ui/kit';

const TITLES: Record<string, string> = {
  student: 'Sign in as a student',
  staff: 'Sign in as staff',
  admin: 'Sign in as the school admin',
};

export default function PasswordSignIn() {
  const { code = '', role = 'student' } = useLocalSearchParams<{ code: string; role: string }>();
  const school = useSchool(code).data?.school;
  const { signedIn } = useAccounts();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const answer = await publicApi<SignedIn>('auth/signin', {
        method: 'POST',
        body: { school_code: code, role, username: username.trim(), password, device: device() },
      });
      await signedIn(answer);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign-in failed.');
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
                {TITLES[role] ?? 'Sign in'}
              </T>
              <T tone="onHeaderSoft">Use the username and password from your school.</T>
            </View>
          </Header>
        }>
        {school ? <SchoolCard name={school.name} address={school.address} logo={school.logo_url} /> : null}
        {error ? <Banner tone="bad">{error}</Banner> : null}
        <Card>
          <Field
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secure
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <Button title="Sign in" onPress={submit} busy={busy} />
        </Card>
        <T v="small" tone="quiet" center>
          Forgot your password? The school office can set a new one for you.
        </T>
      </Screen>
    </KeyboardAvoidingView>
  );
}
