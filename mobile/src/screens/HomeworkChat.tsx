// A homework's messages between a student and the teacher who set it
// (mobile/SPEC.md §5, "Homework messages"). Short notes, not a chat app: one
// thread per homework and student, text only. The student writes in their
// own thread, the teacher to each student of the class, and the student's
// parents may read it.
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActive } from '@/accounts/store';
import { ApiError } from '@/api/client';
import { usePages, useWrite } from '@/api/hooks';
import type { Message, Thread } from '@/api/types';
import { bsFromIso, clock } from '@/lib/format';
import { font, radius, space, usePalette } from '@/theme';
import { Icon } from '@/ui/Icon';
import { Banner, Button, T } from '@/ui/kit';
import { useLeaveGuard } from '@/ui/leaveGuard';
import { Loaded } from '@/ui/parts';
import { useChild } from './child/context';
import { PageHeader } from './parts';

const MAX = 500;
const POLL_MS = 15_000;

type Side = 'student' | 'teacher' | 'parent';

function intro(side: Side, thread: Thread): string {
  if (side === 'student') {
    return `Ask ${thread.teacher_name || 'your teacher'} about this homework. Only you, the teacher and your parents can read it.`;
  }
  if (side === 'teacher') return `Write to ${thread.student_name} about this homework. Their parents can read it too.`;
  return 'No messages about this homework yet.';
}

function Bubble({ message, mine, showSeen }: { message: Message; mine: boolean; showSeen: boolean }) {
  const c = usePalette();
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 2 }}>
      <View
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: c.blueTint, borderColor: c.blueTint, borderBottomRightRadius: 4 }
            : { backgroundColor: c.card, borderColor: c.line, borderBottomLeftRadius: 4 },
        ]}>
        <T>{message.body}</T>
      </View>
      <T v="small" tone="quiet">
        {showSeen && message.seen ? `${clock(message.sent_at)} · Seen` : clock(message.sent_at)}
      </T>
    </View>
  );
}

export function HomeworkChat({ path, side }: { path: string | null; side: Side }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  const write = useWrite();
  const thread = usePages<Message, Thread>(path, { refetchEvery: POLL_MS });
  const first = thread.data?.pages[0];
  const messages = [...thread.items].reverse(); // the server sends newest first
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<ScrollViewInstance>(null);
  const newest = thread.items[0]?.id;
  const shown = useRef<number | undefined>(undefined);
  useLeaveGuard(text.trim().length > 0, 'Your message is not sent yet.');

  // Keep the newest message in view as messages arrive, but not when older
  // ones are loaded above them.
  useEffect(() => {
    if (newest !== undefined && newest !== shown.current) {
      shown.current = newest;
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [newest]);

  async function send() {
    const body = text.trim();
    if (!path || !body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await write(path, 'POST', { body });
      setText('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 0 ? 'Not sent: no connection. Try again when you are online.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const mineSender = side === 'teacher' ? 'teacher' : 'student';
  const lastMine = messages.filter((m) => m.sender === mineSender).at(-1)?.id;
  const title = !first
    ? 'Messages'
    : side === 'teacher'
      ? first.student_name
      : first.teacher_name || 'Teacher';
  // a day's first message gets the date above it
  const days = messages.map((m) => bsFromIso(m.sent_at));

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <PageHeader title={title} sub={first?.homework_title} />
      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.xl, gap: space.md }}>
        <Loaded query={{ ...thread, data: first }}>
          {(data) => (
            <>
              {thread.hasNextPage ? (
                <Button
                  title="Earlier messages"
                  kind="quiet"
                  busy={thread.isFetchingNextPage}
                  onPress={() => void thread.fetchNextPage()}
                />
              ) : null}
              {!messages.length ? (
                <T tone="quiet" center>
                  {intro(side, data)}
                </T>
              ) : null}
              {messages.map((m, i) => {
                const label = i === 0 || days[i] !== days[i - 1] ? days[i] : null;
                return (
                  <View key={m.id} style={{ gap: space.md }}>
                    {label ? (
                      <T v="small" tone="quiet" center>
                        {label}
                      </T>
                    ) : null}
                    <Bubble message={m} mine={m.sender === mineSender && side !== 'parent'} showSeen={m.id === lastMine && side !== 'parent'} />
                  </View>
                );
              })}
            </>
          )}
        </Loaded>
      </ScrollView>
      <View style={[styles.composer, { backgroundColor: c.page, borderTopColor: c.line, paddingBottom: insets.bottom + space.md }]}>
        {error ? <Banner tone="bad">{error}</Banner> : null}
        {first && !first.can_write ? (
          <T v="small" tone="quiet" center>
            {side === 'parent'
              ? 'Only the student and the teacher write here.'
              : 'This student is no longer in the class, so the thread can only be read.'}
          </T>
        ) : first ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
            <View style={[styles.input, { backgroundColor: c.card, borderColor: c.lineStrong }]}>
              <TextInput
                value={text}
                onChangeText={setText}
                placeholder="Write a message"
                placeholderTextColor={c.textFaint}
                multiline
                maxLength={MAX}
                accessibilityLabel="Message"
                style={{ color: c.text, fontFamily: font.medium, fontSize: 16, maxHeight: 120, paddingVertical: 10 }}
              />
              {text.length > MAX - 100 ? (
                <T v="small" tone="quiet" style={{ textAlign: 'right' }}>
                  {`${text.length}/${MAX}`}
                </T>
              ) : null}
            </View>
            <Pressable
              onPress={() => void send()}
              disabled={busy || !text.trim()}
              accessibilityRole="button"
              accessibilityLabel="Send"
              accessibilityState={{ disabled: busy || !text.trim(), busy }}
              style={({ pressed }) => [
                styles.send,
                { backgroundColor: pressed ? c.bluePressed : c.blue },
                (busy || !text.trim()) && { opacity: 0.5 },
              ]}>
              <Icon name="send" size={20} color={c.onBlue} />
            </Pressable>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

/** The student's or the parent's view: /homework/{id}/messages. */
export function ChildHomeworkChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { child } = useChild();
  const { role } = useActive();
  return (
    <HomeworkChat
      path={child && id ? `students/${child.id}/homework/${id}/messages` : null}
      side={role === 'parent' ? 'parent' : 'student'}
    />
  );
}

/** The teacher's view: /homework/{id}/messages/{student}. */
export function StaffHomeworkChat() {
  const { id, student } = useLocalSearchParams<{ id: string; student: string }>();
  return <HomeworkChat path={id && student ? `staff/homework/${id}/messages/${student}` : null} side="teacher" />;
}

const styles = StyleSheet.create({
  bubble: { maxWidth: '82%', borderWidth: 1, borderRadius: radius.card, paddingHorizontal: space.lg, paddingVertical: space.md },
  composer: { paddingHorizontal: space.xl, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth, gap: space.sm },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.lg },
  send: { width: 48, height: 48, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
});
