import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { AccountsProvider, useAccounts } from '@/accounts/store';
import { ApiError, APP_VERSION, updateRequired } from '@/api/client';
import { LockProvider, useLock } from '@/lock/store';
import { QueueRunner } from '@/offline/QueueRunner';
import { PushRunner, PushTaps } from '@/push/PushRunner';
import { LockScreen } from '@/screens/LockScreen';
import { UpdateRequired } from '@/screens/UpdateRequired';
import { usePalette } from '@/theme';

SplashScreen.preventAutoHideAsync();

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
}

const WEEK = 7 * 24 * 60 * 60 * 1000;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: WEEK,
      // A refusal will not change on a retry; a dropped connection might.
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400) && count < 2,
    },
  },
});

// The last answers stay on the phone, so screens open with them offline.
const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: 'schoolcore.cache' });

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{ persister, maxAge: WEEK, buster: APP_VERSION }}>
      <AccountsProvider>
        <LockProvider>
          <QueueRunner />
          {Platform.OS !== 'web' ? <PushRunner /> : null}
          <RootNavigator fontsReady={fontsLoaded || !!fontError} />
        </LockProvider>
      </AccountsProvider>
    </PersistQueryClientProvider>
  );
}

function RootNavigator({ fontsReady }: { fontsReady: boolean }) {
  const c = usePalette();
  const { ready, active, adding } = useAccounts();
  const lock = useLock();
  const [update, setUpdate] = useState<string | null>(null);
  const shown = fontsReady && ready && lock.ready;

  useEffect(() => updateRequired.listen(setUpdate), []);
  useEffect(() => {
    if (shown) SplashScreen.hideAsync();
  }, [shown]);

  if (!shown) return null;
  if (update) return <UpdateRequired message={update} />;

  const welcome = !active || adding;
  const needsSetup = !!active && !adding && lock.required && !lock.hasPin;
  const inApp = !!active && !adding && !needsSetup;
  const role = active?.role;
  const locked = !!active && lock.locked;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <StatusBar style="light" />
      {/* While locked, screen readers must not reach the records under the lock. */}
      <View style={{ flex: 1 }} aria-hidden={locked}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.page } }}>
          <Stack.Screen name="index" />
          <Stack.Protected guard={welcome} redirectTo="/">
            <Stack.Screen name="welcome" />
          </Stack.Protected>
          <Stack.Protected guard={needsSetup || inApp} redirectTo="/">
            <Stack.Screen name="lock-setup" />
          </Stack.Protected>
          <Stack.Protected guard={inApp && role === 'parent'} redirectTo="/">
            <Stack.Screen name="parent" />
          </Stack.Protected>
          <Stack.Protected guard={inApp && role === 'student'} redirectTo="/">
            <Stack.Screen name="student" />
          </Stack.Protected>
          <Stack.Protected guard={inApp && role === 'staff'} redirectTo="/">
            <Stack.Screen name="staff" />
          </Stack.Protected>
          <Stack.Protected guard={inApp && role === 'admin'} redirectTo="/">
            <Stack.Screen name="admin" />
          </Stack.Protected>
          <Stack.Protected guard={inApp} redirectTo="/">
            <Stack.Screen name="sessions" />
          </Stack.Protected>
        </Stack>
      </View>
      {Platform.OS !== 'web' ? <PushTaps /> : null}
      {locked ? (
        <View style={StyleSheet.absoluteFill}>
          <LockScreen />
        </View>
      ) : null}
    </View>
  );
}
