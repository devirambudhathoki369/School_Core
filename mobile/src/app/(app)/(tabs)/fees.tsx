import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useDues, useFeeHistory, useMe } from '@/api/queries';
import type { LedgerEntry } from '@/api/types';
import { bsLong, money, monthName } from '@/lib/format';
import { Card, Divider, Empty, Failed, Loading, PageTitle, Row, Screen, SectionLabel, T } from '@/ui/kit';
import { space, usePalette } from '@/ui/theme';

const MODES: Record<number, string> = { 1: 'Cash', 2: 'Bank', 3: 'Cheque', 4: 'Wallet' };

function months(entry: LedgerEntry): string {
  const list = Array.isArray(entry.months) ? entry.months : [entry.months];
  return list.map(monthName).filter(Boolean).join(', ');
}

export default function Fees() {
  const { me, isLoading, error, refetch } = useMe();
  const dues = useDues(me);
  const history = useFeeHistory(me);

  const refresh = () => {
    void refetch();
    void dues.refetch();
    void history.refetch();
  };

  if (isLoading) return <Screen><Loading /></Screen>;
  if (!me) return <Screen><Failed error={error} onRetry={refresh} /></Screen>;

  const titles = { ...(history.data?.titles ?? {}), ...(dues.data?.titles ?? {}) };
  const owed = Object.entries(dues.data?.bill_amount ?? {}).filter(([, amount]) => Number(amount) > 0);
  const total = Number(dues.data?.total ?? 0);
  const entries = [...(history.data?.data ?? [])].sort(
    (a, b) => b.date.localeCompare(a.date) || Number(b.credit_amount !== undefined) - Number(a.credit_amount !== undefined),
  );

  return (
    <Screen onRefresh={refresh} refreshing={dues.isRefetching || history.isRefetching}>
      <PageTitle title="Fees" sub={me.className} />

      {dues.isLoading ? (
        <Loading />
      ) : dues.error ? (
        <Failed error={dues.error} onRetry={() => dues.refetch()} />
      ) : (
        <Card>
          <T v="label" tone="muted" style={{ textTransform: 'uppercase' }}>
            {total > 0 ? 'Due now' : 'Balance'}
          </T>
          <T v="figure" tone={total > 0 ? 'ink' : 'ok'}>
            {total > 0 ? money(total) : 'Paid up'}
          </T>
          {owed.length ? (
            <View style={{ gap: space.sm }}>
              <Divider />
              {owed.map(([key, amount]) => (
                <Row key={key} label={titles[key] ? cap(titles[key]) : key} value={money(amount)} />
              ))}
            </View>
          ) : (
            <T tone="muted">Nothing is due this year.</T>
          )}
        </Card>
      )}

      <SectionLabel>History</SectionLabel>
      {history.isLoading ? (
        <Loading />
      ) : history.error ? (
        <Failed error={history.error} onRetry={() => history.refetch()} />
      ) : entries.length === 0 ? (
        <Empty icon="file-text" title="No bills or payments yet" />
      ) : (
        <Card style={{ padding: 0, gap: 0 }}>
          {entries.map((entry, i) => (
            <View key={`${entry.credit_amount !== undefined ? 'p' : 'b'}${entry.id}`}>
              {i ? <Divider /> : null}
              <Entry entry={entry} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function Entry({ entry }: { entry: LedgerEntry }) {
  const c = usePalette();
  const paid = entry.credit_amount !== undefined;
  const label = months(entry);
  const body = (
    <View style={styles.entry}>
      <View style={[styles.entryIcon, { backgroundColor: paid ? c.okTint : c.offTint }]}>
        <Feather name={paid ? 'arrow-down-left' : 'file-text'} size={16} color={paid ? c.ok : c.inkMuted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyStrong">
          {paid
            ? `Paid${entry.mode ? ` · ${MODES[entry.mode] ?? 'Other'}` : ''}`
            : label
              ? `Fees for ${label}`
              : 'Fees billed'}
        </T>
        <T v="small" tone="muted">
          {bsLong(entry.date)}
          {paid && label ? ` · for ${label}` : ''}
        </T>
      </View>
      <T v="bodyStrong" tone={paid ? 'ok' : 'ink'}>
        {money(paid ? entry.credit_amount : entry.debit_amount)}
      </T>
      {paid ? <Feather name="chevron-right" size={18} color={c.off} /> : null}
    </View>
  );
  if (!paid) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Receipt ${entry.invoice_id}`}
      onPress={() => router.push({ pathname: '/receipt/[id]', params: { id: String(entry.invoice_id) } })}
      style={({ pressed }) => pressed && { backgroundColor: c.surfaceAlt }}>
      {body}
    </Pressable>
  );
}

function cap(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const styles = StyleSheet.create({
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  entryIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
