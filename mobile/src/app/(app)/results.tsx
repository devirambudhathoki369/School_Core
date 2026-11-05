import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useExams, useMe, useResult } from '@/api/queries';
import type { ResultSheet } from '@/api/types';
import { Card, Divider, Empty, Failed, Loading, Pill, Row, Screen, T } from '@/ui/kit';
import { radius, space, type, usePalette } from '@/ui/theme';

export default function Results() {
  const { me, isLoading, error, refetch } = useMe();
  const exams = useExams(me);
  const [chosen, setChosen] = useState<number | undefined>();
  const list = exams.data ?? [];
  const examId = chosen ?? list[list.length - 1]?.id;
  const result = useResult(me, examId);

  if (isLoading) return <Screen edges={[]}><Loading /></Screen>;
  if (!me) return <Screen edges={[]}><Failed error={error} onRetry={() => refetch()} /></Screen>;

  return (
    <Screen edges={[]} onRefresh={() => void Promise.all([exams.refetch(), result.refetch()])} refreshing={result.isRefetching}>
      {exams.isLoading ? (
        <Loading />
      ) : exams.error ? (
        <Failed error={exams.error} onRetry={() => exams.refetch()} />
      ) : list.length === 0 ? (
        <Empty icon="award" title="No exams yet" body="Exams appear here once the school adds them for this year." />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
            {list.map((exam) => (
              <Chip key={exam.id} label={exam.name} chosen={exam.id === examId} onPress={() => setChosen(exam.id)} />
            ))}
          </ScrollView>
          {result.isLoading ? (
            <Loading />
          ) : result.error || !hasMarks(result.data) ? (
            <Empty
              icon="clock"
              title="Not published yet"
              body="Results show here once the school publishes them for this exam."
            />
          ) : (
            <Sheet sheet={result.data!} />
          )}
        </>
      )}
    </Screen>
  );
}

function hasMarks(sheet: ResultSheet | null | undefined): boolean {
  return !!sheet && !!sheet.result && Object.keys(sheet.result).length > 0;
}

function Sheet({ sheet }: { sheet: ResultSheet }) {
  const rows = sheet.subjects
    .map((id) => ({ id, info: sheet.subjects_data[String(id)], mark: sheet.result[String(id)] }))
    .filter((r) => r.info && r.mark)
    .sort((a, b) => (a.info.order ?? 0) - (b.info.order ?? 0));
  const obtained = rows.reduce((sum, r) => sum + (r.mark.absent ? 0 : Number(r.mark.total ?? 0)), 0);
  const full = rows.reduce((sum, r) => sum + Number(r.info.criteria?.fm ?? 0), 0) || sheet.fm_total;
  const failed = rows.filter((r) => r.mark.absent || !r.mark.result).length;
  const percent = full ? (obtained / full) * 100 : 0;

  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <T v="label" tone="muted" style={{ textTransform: 'uppercase' }}>
            Total
          </T>
          <Pill tone={failed ? 'bad' : 'ok'}>{failed ? `Not passed in ${failed}` : 'Passed'}</Pill>
        </View>
        <T v="figure">{`${percent.toFixed(1)}%`}</T>
        <T tone="muted">{`${fmt(obtained)} out of ${fmt(full)} · ${sheet.classname}`}</T>
      </Card>
      <Card>
        {rows.map((r, i) => (
          <View key={r.id} style={{ gap: space.xs }}>
            {i ? <Divider /> : null}
            <Row
              label={r.info.subject}
              value={r.mark.absent ? 'Absent' : `${fmt(r.mark.total)} / ${fmt(r.info.criteria?.fm)}`}
              tone={r.mark.absent || !r.mark.result ? 'bad' : 'ink'}
              strong
            />
            {Number(r.mark.practical) > 0 ? (
              <T v="small" tone="muted">
                {`Theory ${fmt(r.mark.theory)} · Practical ${fmt(r.mark.practical)}`}
              </T>
            ) : null}
            <T v="small" tone="muted">{`Pass mark ${fmt(r.info.criteria?.pm)}`}</T>
          </View>
        ))}
      </Card>
    </>
  );
}

function fmt(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function Chip({ label, chosen, onPress }: { label: string; chosen: boolean; onPress: () => void }) {
  const c = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: chosen }}
      style={[
        styles.chip,
        chosen
          ? { backgroundColor: c.brandTint, borderColor: c.brand, borderWidth: 1.5 }
          : { backgroundColor: c.surface, borderColor: c.lineStrong, borderWidth: 1 },
      ]}>
      <T v="smallStrong" style={{ color: chosen ? c.brandInk : c.inkSoft, fontSize: type.small.fontSize }}>
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: space.md + 2, paddingVertical: space.sm, borderRadius: radius.pill },
});
