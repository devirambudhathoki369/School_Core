import { Feather } from '@expo/vector-icons';
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { font, radius, space, type, usePalette } from './theme';

type Variant = keyof typeof type;
type Tone = 'ink' | 'soft' | 'muted' | 'brand' | 'ok' | 'warn' | 'bad' | 'onBrand';

export function T({
  v = 'body',
  tone = 'ink',
  style,
  children,
  numberOfLines,
  selectable,
}: {
  v?: Variant;
  tone?: Tone;
  style?: TextStyle | TextStyle[];
  children: ReactNode;
  numberOfLines?: number;
  selectable?: boolean;
}) {
  const c = usePalette();
  const color = {
    ink: c.ink,
    soft: c.inkSoft,
    muted: c.inkMuted,
    brand: c.brandInk,
    ok: c.ok,
    warn: c.warn,
    bad: c.bad,
    onBrand: c.onBrand,
  }[tone];
  return (
    <Text
      style={[type[v], { color }, style as TextStyle]}
      numberOfLines={numberOfLines}
      selectable={selectable}>
      {children}
    </Text>
  );
}

/** A scrolling page on the canvas colour, with pull-to-refresh when given. */
export function Screen({
  children,
  onRefresh,
  refreshing = false,
  edges = ['top'],
  contentStyle,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  edges?: ('top' | 'bottom')[];
  contentStyle?: ViewStyle;
}) {
  const c = usePalette();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.canvas }}>
      <ScrollView
        contentContainerStyle={[styles.screen, contentStyle]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={c.brand}
              colors={[c.brand]}
            />
          ) : undefined
        }>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ gap: space.xs, marginBottom: space.sm }}>
      <T v="title">{title}</T>
      {sub ? <T tone="muted">{sub}</T> : null}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const c = usePalette();
  const base: ViewStyle = {
    backgroundColor: c.surface,
    borderColor: c.line,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.md,
    padding: space.lg,
    gap: space.md,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, style, pressed && { backgroundColor: c.surfaceAlt }]}>
      {children}
    </Pressable>
  );
}

export function SectionLabel({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionLabel}>
      <T v="label" tone="muted" style={{ textTransform: 'uppercase' }}>
        {children}
      </T>
      {action}
    </View>
  );
}

export function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: ReactNode;
  strong?: boolean;
  tone?: Tone;
}) {
  return (
    <View style={styles.row}>
      <T tone="soft" style={{ flexShrink: 1 }}>
        {label}
      </T>
      {typeof value === 'string' || typeof value === 'number' ? (
        <T v={strong ? 'bodyStrong' : 'body'} tone={tone ?? 'ink'} style={styles.rowValue}>
          {value}
        </T>
      ) : (
        value
      )}
    </View>
  );
}

export function Divider() {
  const c = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth * 2, backgroundColor: c.line }} />;
}

type PillTone = 'ok' | 'warn' | 'bad' | 'brand' | 'off' | 'mark';

export function Pill({ tone, children }: { tone: PillTone; children: string }) {
  const c = usePalette();
  const map = {
    ok: [c.okTint, c.ok],
    warn: [c.warnTint, c.warn],
    bad: [c.badTint, c.bad],
    brand: [c.brandTint, c.brandInk],
    off: [c.offTint, c.inkMuted],
    mark: [c.markTint, c.markInk],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[type.smallStrong, { color: fg }]}>{children}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  busy = false,
  disabled = false,
  icon,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'quiet';
  busy?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Feather.glyphMap;
}) {
  const c = usePalette();
  const off = disabled || busy;
  const look = {
    primary: { bg: c.brand, pressed: c.brandPressed, fg: c.onBrand, border: c.brand },
    secondary: { bg: c.surface, pressed: c.surfaceAlt, fg: c.inkSoft, border: c.lineStrong },
    quiet: { bg: 'transparent', pressed: c.brandTint, fg: c.brandInk, border: 'transparent' },
  }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? look.pressed : look.bg, borderColor: look.border },
        off && { opacity: 0.55 },
      ]}>
      {busy ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Feather name={icon} size={18} color={look.fg} /> : null}
          <Text style={[type.bodyStrong, { color: look.fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  secure,
  ...input
}: TextInputProps & { label: string; hint?: string; error?: string | null; secure?: boolean }) {
  const c = usePalette();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.xs + 2 }}>
      <T v="smallStrong" tone="soft">
        {label}
      </T>
      <View
        style={[
          styles.field,
          {
            backgroundColor: c.surface,
            borderColor: error ? c.bad : focused ? c.brand : c.lineStrong,
            borderWidth: focused || error ? 1.5 : 1,
          },
        ]}>
        <TextInput
          {...input}
          secureTextEntry={secure ? hidden : false}
          placeholderTextColor={c.off}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[styles.fieldInput, { color: c.ink, fontFamily: font.regular }]}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={8}>
            <Feather name={hidden ? 'eye' : 'eye-off'} size={18} color={c.inkMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <T v="small" tone="bad">
          {error}
        </T>
      ) : hint ? (
        <T v="small" tone="muted">
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function Banner({ tone, children }: { tone: 'bad' | 'ok' | 'info'; children: string }) {
  const c = usePalette();
  const [bg, fg, icon] = {
    bad: [c.badTint, c.bad, 'alert-circle'],
    ok: [c.okTint, c.ok, 'check-circle'],
    info: [c.brandTint, c.brandInk, 'info'],
  }[tone] as [string, string, keyof typeof Feather.glyphMap];
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert">
      <Feather name={icon} size={18} color={fg} style={{ marginTop: 2 }} />
      <Text style={[type.small, { color: fg, flex: 1 }]}>{children}</Text>
    </View>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  const c = usePalette();
  return (
    <View style={styles.center} accessibilityLabel={label}>
      <ActivityIndicator color={c.brand} />
    </View>
  );
}

export function Empty({
  icon = 'inbox',
  title,
  body,
}: {
  icon?: keyof typeof Feather.glyphMap;
  title: string;
  body?: string;
}) {
  const c = usePalette();
  return (
    <View style={[styles.center, { gap: space.sm }]}>
      <View style={[styles.emptyIcon, { backgroundColor: c.brandTint }]}>
        <Feather name={icon} size={20} color={c.brandInk} />
      </View>
      <T v="bodyStrong" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {body ? (
        <T v="small" tone="muted" style={{ textAlign: 'center', maxWidth: 300 }}>
          {body}
        </T>
      ) : null}
    </View>
  );
}

export function Failed({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <View style={{ gap: space.md }}>
      <Banner tone="bad">{message}</Banner>
      {onRetry ? <Button title="Try again" kind="secondary" icon="refresh-cw" onPress={onRetry} /> : null}
    </View>
  );
}

export function ListItem({
  icon,
  title,
  sub,
  onPress,
  trailing,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  sub?: string;
  onPress: () => void;
  trailing?: ReactNode;
}) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.listItem, pressed && { backgroundColor: c.surfaceAlt }]}>
      <View style={[styles.listIcon, { backgroundColor: c.brandTint }]}>
        <Feather name={icon} size={18} color={c.brandInk} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyStrong">{title}</T>
        {sub ? (
          <T v="small" tone="muted">
            {sub}
          </T>
        ) : null}
      </View>
      {trailing ?? <Feather name="chevron-right" size={18} color={c.off} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { padding: space.lg, paddingBottom: space.xxxl, gap: space.lg },
  sectionLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: space.sm,
    marginBottom: -space.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.md,
  },
  rowValue: { textAlign: 'right', flexShrink: 1 },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  button: {
    minHeight: 48,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  field: {
    minHeight: 48,
    borderRadius: radius.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md + 2,
    gap: space.sm,
  },
  fieldInput: { flex: 1, fontSize: 16, paddingVertical: 12 },
  banner: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.sm + 2,
  },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxxl },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  listIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
