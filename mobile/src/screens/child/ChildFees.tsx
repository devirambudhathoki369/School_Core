import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { useApi } from '@/api/hooks';
import type { FeeHistory, FeesDue, Receipt } from '@/api/types';
import { bsLong, bsShort, rupees, titleCase } from '@/lib/format';
import { space, usePalette } from '@/theme';
import { Button, Card, Divider, ListRow, Screen, SectionLabel, T } from '@/ui/kit';
import { Chip, Empty, Line, Loaded } from '@/ui/parts';
import { useGo } from '../nav';
import { Freshness, PageHeader } from '../parts';
import { useChild } from './context';

export function ChildFees({ root }: { root?: boolean }) {
  const c = usePalette();
  const { child } = useChild();
  const go = useGo();
  const fees = useApi<FeesDue>(child ? `students/${child.id}/fees` : null);
  return (
    <Screen
      onRefresh={() => void fees.refetch()}
      refreshing={fees.isRefetching}
      header={<PageHeader title="Fees" sub={child?.name} onBack={root ? null : undefined} />}>
      <Loaded query={fees}>
        {(data) => (
          <>
            <Freshness updatedAt={fees.dataUpdatedAt} error={fees.error} />
            <Card style={{ gap: space.xs }}>
              <T v="small" tone="quiet">
                {data.total_paisa > 0 ? 'To pay now' : data.total_paisa < 0 ? 'Paid ahead' : 'Nothing to pay'}
              </T>
              <T
                v="display"
                style={{ color: data.total_paisa > 0 ? c.marigoldText : c.ok }}>
                {rupees(Math.abs(data.total_paisa))}
              </T>
              <T v="small" tone="quiet">
                {`Academic year ${data.academic_year}. Pay at the school's fee counter.`}
              </T>
            </Card>
            {data.items.length ? (
              <>
                <SectionLabel>By fee</SectionLabel>
                <Card>
                  {data.items.map((item, i) => (
                    <View key={item.title} style={{ gap: space.md }}>
                      {i ? <Divider /> : null}
                      <Line
                        label={titleCase(item.title)}
                        value={rupees(Math.abs(item.amount_paisa))}
                        tone={item.amount_paisa > 0 ? 'warn' : 'ok'}
                      />
                    </View>
                  ))}
                </Card>
              </>
            ) : null}
            <Button title="Bills and payments" kind="secondary" icon="receipt" onPress={() => go('/fees-history')} />
          </>
        )}
      </Loaded>
    </Screen>
  );
}

export function FeeHistoryScreen() {
  const { child } = useChild();
  const go = useGo();
  const history = useApi<FeeHistory>(child ? `students/${child.id}/fees/history` : null);
  return (
    <Screen
      onRefresh={() => void history.refetch()}
      refreshing={history.isRefetching}
      header={<PageHeader title="Bills and payments" sub={child?.name} />}>
      <Loaded
        query={history}
        empty={(data) =>
          data.items.length ? null : <Empty icon="receipt" title="Nothing yet" body="Bills and payments of this year show here." />
        }>
        {(data) => (
          <Card padded={false}>
            {data.items.map((entry, i) => (
              <View key={`${entry.kind}-${entry.id}`}>
                {i ? <Divider inset={70} /> : null}
                <ListRow
                  icon={entry.kind === 'payment' ? 'check' : 'receipt'}
                  tint={entry.kind === 'payment' ? 'ok' : 'marigold'}
                  title={`${entry.kind === 'payment' ? 'Paid' : 'Billed'} ${rupees(entry.amount_paisa)}`}
                  sub={[bsShort(entry.date), entry.months.join(', '), entry.mode ? titleCase(entry.mode) : null]
                    .filter(Boolean)
                    .join(' · ')}
                  onPress={entry.receipt_id ? () => go(`/receipt/${entry.receipt_id}`) : undefined}
                  trailing={entry.receipt_id ? undefined : <Chip label="Bill" tone="warn" />}
                />
              </View>
            ))}
          </Card>
        )}
      </Loaded>
    </Screen>
  );
}

export function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { child } = useChild();
  const receipt = useApi<Receipt>(child && id ? `students/${child.id}/receipts/${id}` : null);
  return (
    <Screen header={<PageHeader title="Receipt" sub={receipt.data ? `No. ${receipt.data.receipt_no}` : undefined} />}>
      <Loaded query={receipt}>
        {(data) => (
          <>
            <Card>
              <Line label="Student" value={data.student_name} />
              <Line label="Class" value={data.class_name} />
              <Line label="Date" value={bsLong(data.date)} />
              {data.months.length ? <Line label="For" value={data.months.join(', ')} /> : null}
              <Line label="Paid by" value={titleCase(data.mode)} />
              {data.cashier ? <Line label="Received by" value={data.cashier} /> : null}
            </Card>
            <SectionLabel>Paid</SectionLabel>
            <Card>
              {data.lines.map((line, i) => (
                <View key={`${line.title}-${i}`} style={{ gap: space.xs }}>
                  {i ? <Divider /> : null}
                  <Line label={titleCase(line.title)} value={rupees(line.paid_paisa)} strong />
                  {line.discount_paisa ? <Line label="Discount" value={rupees(line.discount_paisa)} tone="ok" /> : null}
                  {line.due_paisa ? <Line label="Still to pay" value={rupees(line.due_paisa)} tone="warn" /> : null}
                </View>
              ))}
              <Divider />
              <Line label="Total paid" value={rupees(data.total_paid_paisa)} strong tone="ok" />
              {data.total_discount_paisa ? <Line label="Total discount" value={rupees(data.total_discount_paisa)} /> : null}
              {data.total_due_paisa ? <Line label="Left to pay" value={rupees(data.total_due_paisa)} tone="warn" /> : null}
            </Card>
            {data.remarks ? (
              <T v="small" tone="quiet">
                {data.remarks}
              </T>
            ) : null}
          </>
        )}
      </Loaded>
    </Screen>
  );
}
