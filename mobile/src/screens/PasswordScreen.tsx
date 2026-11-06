import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

import { ApiError } from '@/api/client';
import { useWrite } from '@/api/hooks';
import { Banner, Button, Card, Field, Screen, T } from '@/ui/kit';
import { back } from './nav';
import { PageHeader } from './parts';

/** Change the password, with the portal's rule: 15 to 128 characters. */
export function PasswordScreen() {
  const write = useWrite();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);

  async function save() {
    setError(null);
    setFields({});
    if (next.length < 15) {
      setFields({ new_password: 'Use at least 15 characters. A few words together are easy to remember.' });
      return;
    }
    if (next !== again) {
      setFields({ again: 'The two new passwords are not the same.' });
      return;
    }
    setBusy(true);
    try {
      const answer = await write<{ message: string }>('me/password', 'POST', {
        current_password: current,
        new_password: next,
      });
      setDone(answer.message);
      setCurrent('');
      setNext('');
      setAgain('');
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError && e.status === 0 ? 'No connection. Try again when you are online.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen header={<PageHeader title="Change password" sub="The same password works in the app and the portal." />}>
        {done ? <Banner tone="ok">{done}</Banner> : null}
        {error && !done ? <Banner tone="bad">{error}</Banner> : null}
        <Card>
          <Field
            label="Current password"
            value={current}
            onChangeText={setCurrent}
            secure
            autoComplete="current-password"
            textContentType="password"
            error={fields.current_password}
          />
          <Field
            label="New password"
            value={next}
            onChangeText={setNext}
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            hint="15 to 128 characters. A few words together, like a short sentence, are strong and easy to remember."
            error={fields.new_password}
          />
          <Field
            label="New password again"
            value={again}
            onChangeText={setAgain}
            secure
            autoComplete="new-password"
            textContentType="newPassword"
            error={fields.again}
            returnKeyType="go"
            onSubmitEditing={() => void save()}
          />
          <Button title={done ? 'Done' : 'Change password'} icon="lock" busy={busy} disabled={!done && (!current || !next || !again)} onPress={done ? back : () => void save()} />
        </Card>
        <T v="small" tone="quiet">
          Every other phone and the portal are signed out. This phone stays signed in.
        </T>
      </Screen>
    </KeyboardAvoidingView>
  );
}
