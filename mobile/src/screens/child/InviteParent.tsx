import { useState } from 'react';
import { Share, View } from 'react-native';

import { useActive } from '@/accounts/store';
import { useApi, useWrite } from '@/api/hooks';
import type { components } from '@/api/schema';
import { bsFromIso } from '@/lib/format';
import { space, type as typeScale, usePalette } from '@/theme';
import { Banner, Button, Card, Screen, T } from '@/ui/kit';
import { Avatar, Chip, Loaded } from '@/ui/parts';
import { PageHeader } from '../parts';

type InviteStatus = components['schemas']['InviteStatusOut'];
type Invite = components['schemas']['InviteOut'];

/** A student brings their parent into the app with a one-time family code. */
export function InviteParentScreen() {
  const c = usePalette();
  const account = useActive();
  const write = useWrite();
  const status = useApi<InviteStatus>('me/parent-invite');
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      setInvite(await write<Invite>('me/parent-invite', 'POST'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const message = invite
    ? `Join me on the SchoolCore app to see my attendance, results and fees.\n\n` +
      `1. Install SchoolCore.\n2. Enter the school code ${invite.school_code} and choose Parent.\n` +
      `3. Tap "I have a family code" and enter ${invite.code} with your email.\n\n` +
      `The code works once, until ${bsFromIso(invite.expires_at)}.`
    : '';

  return (
    <Screen
      onRefresh={() => void status.refetch()}
      refreshing={status.isRefetching}
      header={<PageHeader title="Invite my parent" sub="They see your attendance, homework, results and fees." />}>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Loaded query={status}>
        {(s) => (
          <>
            {s.parent ? (
              <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <Avatar name={s.parent.name} tone="warn" />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong">{s.parent.name}</T>
                  <T v="small" tone="quiet">
                    {`Phone number ending ${s.parent.phone_last_digits}`}
                  </T>
                </View>
                <Chip
                  label={s.parent.has_email ? (s.parent.on_app ? 'On the app' : 'Joined') : 'Not yet'}
                  tone={s.parent.has_email ? 'ok' : 'quiet'}
                />
              </Card>
            ) : null}
            {s.reason ? <Banner tone="info">{s.reason}</Banner> : null}
            {invite ? (
              <Card style={{ borderColor: c.marigold, borderWidth: 2 }}>
                <T v="smallStrong" tone="soft">
                  Show this to your parent
                </T>
                <T style={{ ...typeScale.display, letterSpacing: 4, textAlign: 'center', color: c.text }}>{invite.code}</T>
                <T v="small" tone="soft">
                  {`School code ${invite.school_code}. In the app they choose Parent, then “I have a family code”, and enter this code with their email. It works once, until ${bsFromIso(invite.expires_at)}.`}
                </T>
                <Button
                  title="Send it to them"
                  icon="send"
                  onPress={() => void Share.share({ message }).catch(() => undefined)}
                />
              </Card>
            ) : s.can_invite ? (
              <Card>
                <T>
                  Make a code for your parent. They enter it in their own phone with their email, once, and from then
                  on sign in with their email.
                </T>
                <Button title="Make an invite code" icon="key" busy={busy} onPress={() => void make()} />
              </Card>
            ) : null}
            <T v="small" tone="quiet">
              {`A new code cancels the last one. Your parent sees every child of ${account.school.name} on their phone number.`}
            </T>
          </>
        )}
      </Loaded>
    </Screen>
  );
}
