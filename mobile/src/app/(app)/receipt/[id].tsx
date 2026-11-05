import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { useMe, useReceipt } from '@/api/queries';
import { bsLong, money, monthName, titleCase } from '@/lib/format';
import { Card, Divider, Failed, Loading, Pill, Row, Screen, SectionLabel, T } from '@/ui/kit';
import { space } from '@/ui/theme';

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useMe();
  const query = useReceipt(me?.schoolId, Number(id));
  const invoice = query.data?.invoice;
  const format = query.data?.particular_format ?? ['title', 'rate', 'paid', 'due', 'discount'];
  const at = (name: string) => format.indexOf(name);

  return (
    <Screen edges={[]} onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      {query.isLoading || !me ? (
        <Loading />
      ) : query.error || !invoice ? (
        <Failed error={query.error ?? new Error('This receipt could not be found.')} onRetry={() => query.refetch()} />
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <T v="label" tone="muted" style={{ textTransform: 'uppercase' }}>
                Receipt no. {invoice.invoice_id}
              </T>
              <Pill tone="ok">Paid</Pill>
            </View>
            <T v="figure">{money(invoice.total_paid)}</T>
            <T tone="muted">
              {bsLong(invoice.date)}
              {invoice.payment_mode ? ` · ${titleCase(invoice.payment_mode)}` : ''}
            </T>
          </Card>

          <SectionLabel>Paid for</SectionLabel>
          <Card>
            {invoice.particulars.map((line, i) => (
              <View key={`${line[at('title')]}${i}`} style={{ gap: space.md }}>
                {i ? <Divider /> : null}
                <Row label={String(line[at('title')])} value={money(line[at('paid')])} />
                {Number(line[at('discount')]) > 0 ? (
                  <Row label="Discount" value={money(line[at('discount')])} tone="ok" />
                ) : null}
              </View>
            ))}
            <Divider />
            {invoice.total_discount > 0 ? <Row label="Total discount" value={money(invoice.total_discount)} /> : null}
            <Row label="Total paid" value={money(invoice.total_paid)} strong />
            {invoice.total_due > 0 ? <Row label="Still due" value={money(invoice.total_due)} tone="bad" strong /> : null}
          </Card>

          <SectionLabel>Details</SectionLabel>
          <Card>
            <Row label="Student" value={titleCase(invoice.student_name)} />
            <Row label="Class" value={invoice.class} />
            {invoice.payment_month ? <Row label="For the month of" value={monthName(invoice.payment_month)} /> : null}
            {invoice.cashier ? <Row label="Received by" value={invoice.cashier} /> : null}
            {invoice.remarks ? <Row label="Remarks" value={invoice.remarks} /> : null}
          </Card>
        </>
      )}
    </Screen>
  );
}
