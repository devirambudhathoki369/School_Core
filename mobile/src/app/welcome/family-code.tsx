import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { ApiError, publicApi } from '@/api/client';
import type { CodeSent } from '@/api/types';
import { space } from '@/theme';
import { Banner, Button, Card, Field, Header, Screen, T } from '@/ui/kit';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function FamilyCode() {
  const { code = '' } = useLocalSearchParams<{ code: string }>();
  const [familyCode, setFamilyCode] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ family?: string; email?: string; form?: string }>({});

  async function submit() {
    const clean = email.trim().toLowerCase();
    const next: typeof errors = {};
    if (familyCode.replace(/[\s-]/g, '').length !== 8) next.family = 'Enter the 8-character code from the school.';
    if (!EMAIL.test(clean)) next.email = 'Enter your email address.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await publicApi<CodeSent>('auth/parent/family-code', {
        method: 'POST',
        body: { school_code: code, email: clean, family_code: familyCode },
      });
      router.push({ pathname: '/welcome/verify', params: { code, email: clean, mode: 'family' } });
    } catch (e) {
      const message = e instanceof ApiError ? e.message : 'That did not work.';
      if (e instanceof ApiError && e.code === 'wrong_family_code') setErrors({ family: message });
      else if (e instanceof ApiError && e.code === 'email_taken') setErrors({ email: message });
      else setErrors({ form: message });
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
                Use your family code
              </T>
              <T tone="onHeaderSoft">The school gives it to parents whose email it doesn’t have. You need it once.</T>
            </View>
          </Header>
        }>
        {errors.form ? <Banner tone="bad">{errors.form}</Banner> : null}
        <Card>
          <Field
            label="Family code"
            value={familyCode}
            onChangeText={(text) => setFamilyCode(text.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={9}
            placeholder="ABCD-EFGH"
            error={errors.family}
          />
          <Field
            label="Your email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            hint="We send a code here to check it is yours. You sign in with it from then on."
            error={errors.email}
            returnKeyType="send"
            onSubmitEditing={submit}
          />
          <Button title="Continue" onPress={submit} busy={busy} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
