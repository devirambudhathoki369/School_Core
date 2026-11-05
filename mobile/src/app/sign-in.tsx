import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { useSession } from '@/auth/session';
import { Wordmark } from '@/ui/brand';
import { Banner, Button, Card, Field, Screen, T } from '@/ui/kit';
import { space } from '@/ui/theme';

export default function SignIn() {
  const { signIn, notice, clearNotice } = useSession();
  const params = useLocalSearchParams<{ ready?: string; username?: string }>();
  const [username, setUsername] = useState(params.username ?? '');
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
    clearNotice();
    try {
      await signIn(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']} contentStyle={{ flexGrow: 1, justifyContent: 'center', gap: space.xxl }}>
        <Wordmark />
        <View style={{ gap: space.xs }}>
          <T v="title">Sign in</T>
          <T tone="muted">For students and parents. Use the account made for the student.</T>
        </View>

        {params.ready ? <Banner tone="ok">Your account is ready. Sign in with your new password.</Banner> : null}
        {notice ? <Banner tone="info">{notice}</Banner> : null}
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

        <View style={{ alignItems: 'center', gap: space.xs }}>
          <T v="small" tone="muted">
            No account yet?
          </T>
          <Button title="Create an account" kind="quiet" onPress={() => router.push('/register')} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
