import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { api, ApiError } from '@/api/client';
import { Banner, Button, Card, Field, Screen, T } from '@/ui/kit';
import { space } from '@/ui/theme';

// The server's rule (backend/account/passwords.py): 15 to 128 characters.
const MIN_PASSWORD = 15;

type Errors = Partial<Record<'student' | 'contact' | 'username' | 'password' | 'confirm', string>>;

export default function Register() {
  const [student, setStudent] = useState('');
  const [contact, setContact] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function check(): Errors {
    const next: Errors = {};
    if (!/^\d+$/.test(student.trim())) next.student = 'Enter the student ID, digits only.';
    if (!/^\d{7,15}$/.test(contact.replace(/\D/g, ''))) next.contact = 'Enter the phone number the school has.';
    if (!/^[\w.@+-]{3,150}$/.test(username.trim()))
      next.username = 'Use 3 or more letters, digits or . @ + - _ with no spaces.';
    if (password.length < MIN_PASSWORD || password.length > 128)
      next.password = `Use ${MIN_PASSWORD} to 128 characters.`;
    if (confirm !== password) next.confirm = 'The two passwords are not the same.';
    return next;
  }

  async function submit() {
    const found = check();
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    const phone = contact.replace(/\D/g, '');
    try {
      await api('/auth/student/register', {
        method: 'POST',
        auth: false,
        body: { student: Number(student.trim()), contact: phone, username: username.trim(), password },
      });
      router.replace({ pathname: '/verify', params: { username: username.trim(), contact: phone } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setErrors({ username: 'That username is taken. Try another.' });
      } else if (e instanceof ApiError && e.status === 400 && e.message === 'The request could not be completed.') {
        // The server answers a mismatch with a bare "Invalid request!".
        setFailure(
          "We couldn't create the account. Check the student ID, and that the phone number is the one the school has on record. A student can have only one account.",
        );
      } else {
        setFailure(e instanceof Error ? e.message : 'Sign-up failed.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'bottom']}>
        <Button title="Back to sign in" kind="quiet" icon="arrow-left" onPress={() => router.back()} />
        <View style={{ gap: space.xs }}>
          <T v="title">Create an account</T>
          <T tone="muted">
            For a student at a school that uses SchoolCore. We send a code by SMS to the phone number the school has on
            record, to make sure it is you.
          </T>
        </View>

        {failure ? <Banner tone="bad">{failure}</Banner> : null}

        <Card>
          <Field
            label="Student ID"
            value={student}
            onChangeText={setStudent}
            keyboardType="number-pad"
            hint="The ID the school gave for this student. Ask the school office if you don't have it."
            error={errors.student}
          />
          <Field
            label="Phone number"
            value={contact}
            onChangeText={setContact}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            hint="The student's or guardian's number on the school's record."
            error={errors.contact}
          />
        </Card>

        <Card>
          <Field
            label="Choose a username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            error={errors.username}
          />
          <Field
            label="Choose a password"
            value={password}
            onChangeText={setPassword}
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            hint="At least 15 characters. A few words together works well, like 'mango river school bus'."
            error={errors.password}
          />
          <Field
            label="Type the password again"
            value={confirm}
            onChangeText={setConfirm}
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            error={errors.confirm}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <Button title="Send the code" icon="message-square" onPress={submit} busy={busy} />
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}
