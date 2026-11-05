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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { font, radius, space, type, usePalette, type Palette } from '@/theme';
import { Icon, type IconName } from './Icon';

type Variant = keyof typeof type;
type Tone = 'text' | 'soft' | 'quiet' | 'blue' | 'ok' | 'bad' | 'marigold' | 'onHeader' | 'onHeaderSoft';

function toneColor(c: Palette, tone: Tone) {
  return {
    text: c.text,
    soft: c.textSoft,
    quiet: c.textQuiet,
    blue: c.blueText,
    ok: c.ok,
    bad: c.bad,
    marigold: c.marigoldText,
    onHeader: c.onHeader,
    onHeaderSoft: c.onHeaderSoft,
  }[tone];
}

export function T({
  v = 'body',
  tone = 'text',
  style,
  children,
  numberOfLines,
  center,
}: {
  v?: Variant;
  tone?: Tone;
  style?: TextStyle;
  children: ReactNode;
  numberOfLines?: number;
  center?: boolean;
}) {
  const c = usePalette();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[type[v], { color: toneColor(c, tone) }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

/** The navy panel at the top of a screen, with rounded lower corners. */
export function Header({
  children,
  onBack,
  backLabel = 'Back',
  right,
}: {
  children: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  right?: ReactNode;
}) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { backgroundColor: c.header, paddingTop: insets.top + space.lg }]}>
      {onBack || right ? (
        <View style={styles.headerBar}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              hitSlop={8}
              style={({ pressed }) => [styles.headerBack, pressed && { opacity: 0.7 }]}>
              <Icon name="chevron-left" color={c.onHeader} size={24} />
            </Pressable>
          ) : (
            <View />
          )}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** A page on the light ground: an optional header, then scrolling content. */
export function Screen({
  header,
  children,
  onRefresh,
  refreshing = false,
  footer,
  contentStyle,
}: {
  header?: ReactNode;
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  footer?: ReactNode;
  contentStyle?: ViewStyle;
}) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          { paddingBottom: footer ? space.lg : insets.bottom + space.xxxl },
          !header && { paddingTop: insets.top },
        ]}
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.blue} colors={[c.blue]} />
          ) : undefined
        }>
        {header}
        <View style={[styles.content, contentStyle]}>{children}</View>
      </ScrollView>
      {footer ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg, backgroundColor: c.page }]}>{footer}</View>
      ) : null}
    </View>
  );
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: ViewStyle; padded?: boolean }) {
  const c = usePalette();
  return (
    <View
      style={[
        { backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: radius.card },
        padded && { padding: space.lg, gap: space.md },
        style,
      ]}>
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return (
    <T v="label" tone="quiet" style={{ textTransform: 'uppercase', marginTop: space.sm, marginBottom: -space.xs }}>
      {children}
    </T>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const c = usePalette();
  return <View style={{ height: 1, backgroundColor: c.line, marginLeft: inset }} />;
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
  kind?: 'primary' | 'secondary' | 'quiet' | 'danger';
  busy?: boolean;
  disabled?: boolean;
  icon?: IconName;
}) {
  const c = usePalette();
  const off = busy || disabled;
  const look = {
    primary: { bg: c.blue, pressed: c.bluePressed, fg: c.onBlue, edge: c.blue },
    secondary: { bg: c.card, pressed: c.cardAlt, fg: c.text, edge: c.lineStrong },
    quiet: { bg: 'transparent', pressed: c.blueTint, fg: c.blueText, edge: 'transparent' },
    danger: { bg: c.card, pressed: c.badTint, fg: c.bad, edge: c.lineStrong },
  }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: pressed ? look.pressed : look.bg, borderColor: look.edge },
        off && { opacity: 0.6 },
      ]}>
      {busy ? (
        <ActivityIndicator color={look.fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon ? <Icon name={icon} size={20} color={look.fg} /> : null}
          <Text style={[type.bodyStrong, { color: look.fg, fontFamily: font.bold }]}>{title}</Text>
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
    <View style={{ gap: 6 }}>
      <T v="smallStrong" tone="soft">
        {label}
      </T>
      <View
        style={[
          styles.field,
          {
            backgroundColor: c.card,
            borderColor: error ? c.bad : focused ? c.blue : c.lineStrong,
            borderWidth: focused || error ? 1.5 : 1,
          },
        ]}>
        <TextInput
          {...input}
          secureTextEntry={secure ? hidden : false}
          placeholderTextColor={c.textFaint}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          style={[styles.fieldInput, { color: c.text, fontFamily: font.medium }, input.style]}
        />
        {secure ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            hitSlop={10}>
            <Icon name={hidden ? 'eye' : 'eye-off'} size={20} color={c.textQuiet} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <T v="small" tone="bad">
          {error}
        </T>
      ) : hint ? (
        <T v="small" tone="quiet">
          {hint}
        </T>
      ) : null}
    </View>
  );
}

/** `warn` is marigold: offline, or due soon (SPEC §7). */
export function Banner({ tone, children }: { tone: 'bad' | 'ok' | 'info' | 'warn'; children: string }) {
  const c = usePalette();
  const [bg, fg, icon] = {
    bad: [c.badTint, c.bad, 'alert'],
    ok: [c.okTint, c.ok, 'check'],
    info: [c.blueTint, c.blueText, 'alert'],
    warn: [c.marigoldTint, c.marigoldText, 'alert'],
  }[tone] as [string, string, IconName];
  return (
    <View style={[styles.banner, { backgroundColor: bg }]} accessibilityRole="alert">
      <Icon name={icon} size={18} color={fg} />
      <Text style={[type.small, { color: fg, flex: 1, fontFamily: font.medium }]}>{children}</Text>
    </View>
  );
}

export function Loading() {
  const c = usePalette();
  return (
    <View style={{ paddingVertical: space.xxxl, alignItems: 'center' }}>
      <ActivityIndicator color={c.blue} />
    </View>
  );
}

/** A row with a tinted icon tile, a title and a line under it. */
export function ListRow({
  icon,
  tint = 'blue',
  title,
  sub,
  onPress,
  trailing,
  accessibilityLabel,
}: {
  icon: IconName;
  tint?: 'blue' | 'marigold' | 'bad' | 'ok';
  title: string;
  sub?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  accessibilityLabel?: string;
}) {
  const c = usePalette();
  const [bg, fg] = {
    blue: [c.blueTint, c.blueText],
    marigold: [c.marigoldTint, c.marigoldText],
    bad: [c.badTint, c.bad],
    ok: [c.okTint, c.ok],
  }[tint];
  const body = (
    <>
      <View style={[styles.rowTile, { backgroundColor: bg }]}>
        <Icon name={icon} size={22} color={fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyStrong" tone={tint === 'bad' ? 'bad' : 'text'}>
          {title}
        </T>
        {sub ? (
          <T v="small" tone="quiet">
            {sub}
          </T>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevron-right" size={20} color={c.textFaint} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.cardAlt }]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl,
    borderBottomLeftRadius: radius.sheet,
    borderBottomRightRadius: radius.sheet,
    gap: space.lg,
  },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -space.sm },
  headerBack: { width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: space.xl, paddingTop: space.xl, gap: space.lg },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, gap: space.sm },
  button: {
    minHeight: 52,
    borderRadius: radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  field: {
    minHeight: 52,
    borderRadius: radius.control,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  fieldInput: { flex: 1, fontSize: 16, paddingVertical: 13 },
  banner: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', padding: space.md, borderRadius: radius.control },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, minHeight: 64 },
  rowTile: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
