import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { useApi } from '@/api/hooks';
import type { ExamList, ExamResult, Timetable } from '@/api/types';
import { bsLong, trimNumber } from '@/lib/format';
import { space, usePalette } from '@/theme';
import { Card, Divider, ListRow, Screen, SectionLabel, T } from '@/ui/kit';
import { Chip, Empty, Line, Loaded, Row, Tile } from '@/ui/parts';
import { useGo } from '../nav';
import { PageHeader } from '../parts';
import { useChild } from './context';

export function ChildResults({ root }: { root?: boolean }) {
  const { child } = useChild();
  const go = useGo();
  const exams = useApi<ExamList>(child ? `students/${child.id}/results` : null);
  return (
    <Screen
      onRefresh={() => void exams.refetch()}
      refreshing={exams.isRefetching}
      header={<PageHeader title="Results" sub={child?.name} onBack={root ? null : undefined} />}>
      <Loaded
        query={exams}
        empty={(data) =>
          data.items.length ? null : (
            <Empty icon="award" title="No results yet" body="Results show here once the school publishes them." />
          )
        }>
        {(data) => (
          <Card padded={false}>
            {data.items.map((exam, i) => (
              <View key={exam.id}>
                {i ? <Divider inset={70} /> : null}
                <ListRow
                  icon="award"
                  title={exam.name}
                  sub={exam.published_date ? `Published ${bsLong(exam.published_date)}` : undefined}
                  onPress={() => go(`/result/${exam.id}`)}
                />
              </View>
            ))}
          </Card>
        )}
      </Loaded>
    </Screen>
  );
}

export function ExamResultScreen() {
  const c = usePalette();
  const { exam } = useLocalSearchParams<{ exam: string }>();
  const { child } = useChild();
  const result = useApi<ExamResult>(child && exam ? `students/${child.id}/results/${exam}` : null);
  return (
    <Screen header={<PageHeader title={result.data?.exam.name ?? 'Result'} sub={child?.name} />}>
      <Loaded query={result}>
        {(data) => (
          <>
            <Row>
              <Tile label="Total" value={`${data.total}/${data.full_marks}`} />
              <Tile
                label={data.gpa ? 'GPA' : 'Percentage'}
                value={data.gpa ?? (data.percentage ? `${data.percentage}%` : '-')}
                sub={data.gpa && data.percentage ? `${data.percentage}%` : undefined}
              />
            </Row>
            <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T v="bodyStrong">{data.class_name}</T>
              <Chip label={data.passed ? 'Passed' : 'Not passed'} tone={data.passed ? 'ok' : 'bad'} />
            </Card>
            <SectionLabel>Subjects</SectionLabel>
            <Card>
              {data.subjects.map((subject, i) => (
                <View key={`${subject.subject}-${i}`} style={{ gap: space.xs }}>
                  {i ? <Divider /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                    <T v="bodyStrong" style={{ flex: 1 }}>
                      {subject.subject}
                    </T>
                    {subject.grade ? <Chip label={subject.grade} tone={subject.passed ? 'blue' : 'bad'} /> : null}
                    <T v="bodyStrong" style={{ color: subject.passed ? c.text : c.bad, minWidth: 64, textAlign: 'right' }}>
                      {subject.absent ? 'Absent' : `${trimNumber(subject.total)}/${trimNumber(subject.full_marks)}`}
                    </T>
                  </View>
                  {subject.practical ? (
                    <T v="small" tone="quiet">
                      {`Theory ${trimNumber(subject.theory)} · practical ${trimNumber(subject.practical)}`}
                    </T>
                  ) : null}
                  {!subject.passed && !subject.absent ? (
                    <T v="small" tone="bad">
                      {`Pass mark ${trimNumber(subject.pass_marks)}`}
                    </T>
                  ) : null}
                </View>
              ))}
            </Card>
            {data.attendance_total ? (
              <Card>
                <Line label="Days present" value={`${data.attendance ?? 0} of ${data.attendance_total}`} />
              </Card>
            ) : null}
          </>
        )}
      </Loaded>
    </Screen>
  );
}

export function TimetableScreen() {
  const { child } = useChild();
  const timetable = useApi<Timetable>(child ? `students/${child.id}/timetable` : null);
  return (
    <Screen header={<PageHeader title="Timetable" sub={timetable.data?.class_name ?? child?.class_name} />}>
      <Loaded
        query={timetable}
        empty={(data) =>
          data.periods.length ? null : (
            <Empty icon="clock" title="No timetable yet" body="The class's periods show here once the school sets them." />
          )
        }>
        {(data) => (
          <Card padded={false}>
            {data.periods.map((period, i) => (
              <View key={period.period}>
                {i ? <Divider inset={70} /> : null}
                <ListRow
                  icon="clock"
                  title={`Period ${period.period} · ${period.subject ?? 'Free'}`}
                  sub={period.teacher ?? undefined}
                />
              </View>
            ))}
          </Card>
        )}
      </Loaded>
    </Screen>
  );
}
