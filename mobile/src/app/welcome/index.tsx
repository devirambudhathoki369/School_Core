import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAccounts } from '@/accounts/store';
import { ApiError } from '@/api/client';
import { useSchool } from '@/api/hooks';
import { space } from '@/theme';
import { Wordmark } from '@/ui/Mark';
import { SchoolCard } from '@/ui/SchoolCard';
import { Banner, Button, Card, Divider, Field, Header, ListRow, Screen, SectionLabel, T } from '@/ui/kit';

const LAST_SCHOOL = 'schoolcore.lastSchool';

export default function Welcome() {
  const { adding, setAdding, notice, clearNotice, accounts } = useAccounts();
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState<string | undefined>();
  const school = useSchool(code);

  useEffect(() => {
    AsyncStorage.getItem(LAST_SCHOOL)
      .then((last) => {
        if (last) {
          setTyped(last);
          setCode(last);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (school.data && code) void AsyncStorage.setItem(LAST_SCHOOL, code);
  }, [school.data, code]);

  function find() {
    const clean = typed.replace(/\s+/g, '').toUpperCase();
    if (clean) setCode(clean);
  }

  const notFound = school.error instanceof ApiError && school.error.status === 404;
  const found = school.data?.school;

  function go(path: '/welcome/sign-in' | '/welcome/parent', role?: string) {
    if (!found) return;
    router.push({ pathname: path, params: { code: found.code, ...(role ? { role } : {}) } });
  }

  return (
    <Screen
      header={
        <Header
          onBack={adding && accounts.length ? () => setAdding(false) : undefined}
          backLabel="Cancel adding an account">
          <Wordmark onDark />
          <View style={{ gap: space.xs }}>
            <T v="display" tone="onHeader">
              {adding ? 'Add an account' : 'Welcome'}
            </T>
            <T tone="onHeaderSoft">Find your school, then choose how you sign in.</T>
          </View>
        </Header>
      }>
      {notice ? (
        <Pressable onPress={clearNotice} accessibilityRole="button" accessibilityLabel="Dismiss">
          <Banner tone="info">{notice}</Banner>
        </Pressable>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field
            label="School code"
            value={typed}
            onChangeText={(text) => {
              setTyped(text.toUpperCase());
              if (code) setCode(undefined);
            }}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            returnKeyType="search"
            onSubmitEditing={find}
            placeholder="For example DEMO01"
            error={notFound ? 'No school uses that code. Check it with your school.' : null}
          />
        </View>
        {!found ? (
          <View style={{ width: 96, marginBottom: notFound ? 24 : 0 }}>
            <Button title="Find" onPress={find} busy={school.isFetching} />
          </View>
        ) : null}
      </View>
      {school.error && !notFound ? <Banner tone="bad">{(school.error as Error).message}</Banner> : null}

      {found ? (
        <>
          <SchoolCard
            name={found.name}
            address={found.address}
            logo={found.logo_url}
            action={
              <Pressable
                onPress={() => {
                  setCode(undefined);
                  setTyped('');
                }}
                accessibilityRole="button"
                hitSlop={8}>
                <T v="smallStrong" tone="blue">
                  Change
                </T>
              </Pressable>
            }
          />
          <SectionLabel>I am a</SectionLabel>
          <Card padded={false}>
            <ListRow
              icon="student"
              title="Student"
              sub="Username and password"
              onPress={() => go('/welcome/sign-in', 'student')}
            />
            <Divider inset={70} />
            <ListRow
              icon="parent"
              tint="marigold"
              title="Parent"
              sub="We email you a sign-in code"
              onPress={() => go('/welcome/parent')}
            />
            <Divider inset={70} />
            <ListRow
              icon="staff"
              title="Teacher or staff"
              sub="Username and password"
              onPress={() => go('/welcome/sign-in', 'staff')}
            />
            <Divider inset={70} />
            <ListRow
              icon="admin"
              tint="marigold"
              title="School admin"
              sub="Username and password"
              onPress={() => go('/welcome/sign-in', 'admin')}
            />
          </Card>
        </>
      ) : (
        <T v="small" tone="quiet">
          Your school gives you its code. Ask the school office if you don’t have it.
        </T>
      )}
    </Screen>
  );
}
