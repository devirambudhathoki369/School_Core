import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useAccounts } from '@/accounts/store';
import { readSecret, writeSecret } from '@/accounts/secure';

// The app lock (mobile/SPEC.md §3): a PIN kept only as a salted hash on this
// phone, plus fingerprint or face where the phone has it. Required while a
// staff or admin account is on the phone. Locks on launch and after 30
// seconds away; five wrong PINs sign every account off the phone. The count
// of wrong PINs is saved too, so closing the app does not reset it.
//
// On Android only strong biometrics count (a fingerprint, a 3D face scan): a
// camera face unlock can be fooled by a photo, so such a phone uses the PIN.
// While a PIN is set, the app's content is covered whenever the app is not in
// front, so the app switcher's picture of it shows nothing behind the lock.

const LOCK_KEY = 'schoolcore.lock';
const FAILURES_KEY = 'schoolcore.lock.failures';
const AWAY_SECONDS = 30;
export const MAX_PIN_FAILURES = 5;

type Saved = { salt: string; hash: string; biometrics: boolean };

type Lock = {
  ready: boolean;
  hasPin: boolean;
  required: boolean;
  locked: boolean;
  biometricsAvailable: boolean;
  biometricsOn: boolean;
  failures: number;
  /** The app is not in front and a PIN is set: cover what it shows. */
  covered: boolean;
  setPin: (pin: string, biometrics: boolean) => Promise<void>;
  removePin: () => Promise<void>;
  setBiometrics: (on: boolean) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<'ok' | 'wrong' | 'wiped'>;
  unlockWithBiometrics: () => Promise<boolean>;
};

const Context = createContext<Lock | null>(null);

export function useLock(): Lock {
  const value = use(Context);
  if (!value) throw new Error('useLock must be used inside <LockProvider>');
  return value;
}

async function hashPin(salt: string, pin: string) {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

function randomSalt() {
  return Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function LockProvider({ children }: { children: ReactNode }) {
  const { accounts, forgetAll } = useAccounts();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [failures, setFailures] = useState(0);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [away, setAway] = useState(false);
  const awayAt = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const text = await readSecret(LOCK_KEY);
      const parsed = text ? (JSON.parse(text) as Saved) : null;
      setSaved(parsed);
      setLocked(!!parsed);
      setFailures(Number(await readSecret(FAILURES_KEY)) || 0);
      if (Platform.OS !== 'web') {
        try {
          const enrolled =
            (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
          const strong =
            Platform.OS !== 'android' ||
            (await LocalAuthentication.getEnrolledLevelAsync()) >= LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG;
          setBiometricsAvailable(enrolled && strong);
        } catch {
          setBiometricsAvailable(false);
        }
      }
      setReady(true);
    })().catch(() => setReady(true));
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        awayAt.current ??= Date.now();
        setAway(true);
      } else if (state === 'active') {
        const gone = awayAt.current ? (Date.now() - awayAt.current) / 1000 : 0;
        awayAt.current = null;
        if (saved && gone >= AWAY_SECONDS) setLocked(true);
        setAway(false);
      }
    });
    return () => subscription.remove();
  }, [saved]);

  const store = useCallback(async (next: Saved | null) => {
    setSaved(next);
    await writeSecret(LOCK_KEY, next ? JSON.stringify(next) : null);
  }, []);

  const countFailures = useCallback(async (count: number) => {
    setFailures(count);
    await writeSecret(FAILURES_KEY, count ? String(count) : null);
  }, []);

  const required = accounts.some((a) => a.role === 'staff' || a.role === 'admin');

  const value = useMemo<Lock>(
    () => ({
      ready,
      hasPin: !!saved,
      required,
      locked: locked && !!saved,
      biometricsAvailable,
      biometricsOn: !!saved?.biometrics && biometricsAvailable,
      failures,
      covered: away && !!saved,
      setPin: async (pin, biometrics) => {
        const salt = randomSalt();
        await store({ salt, hash: await hashPin(salt, pin), biometrics });
        await countFailures(0);
        setLocked(false);
      },
      removePin: async () => {
        await store(null);
        setLocked(false);
      },
      setBiometrics: async (on) => {
        if (saved) await store({ ...saved, biometrics: on });
      },
      unlockWithPin: async (pin) => {
        if (!saved) return 'ok';
        if ((await hashPin(saved.salt, pin)) === saved.hash) {
          await countFailures(0);
          setLocked(false);
          return 'ok';
        }
        const next = failures + 1;
        await countFailures(next);
        if (next >= MAX_PIN_FAILURES) {
          await forgetAll();
          await store(null);
          await countFailures(0);
          setLocked(false);
          return 'wiped';
        }
        return 'wrong';
      },
      unlockWithBiometrics: async () => {
        if (!saved?.biometrics || Platform.OS === 'web') return false;
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock SchoolCore',
          cancelLabel: 'Use PIN',
          disableDeviceFallback: true,
          biometricsSecurityLevel: 'strong',
        });
        if (result.success) {
          await countFailures(0);
          setLocked(false);
        }
        return result.success;
      },
    }),
    [ready, saved, required, locked, biometricsAvailable, failures, away, store, countFailures, forgetAll],
  );

  return <Context value={value}>{children}</Context>;
}
