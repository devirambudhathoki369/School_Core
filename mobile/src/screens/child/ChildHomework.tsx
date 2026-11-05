import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useApi, usePages, useWrite } from '@/api/hooks';
import { ApiError } from '@/api/client';
import type { FileLink, Homework, HomeworkList } from '@/api/types';
import { bsLong, bsToday, dueLabel } from '@/lib/format';
import { space } from '@/theme';
import { Banner, Button, Card, Divider, ListRow, Screen, SectionLabel, T } from '@/ui/kit';
import { Chip, Empty, LoadMore, Loaded, Segmented } from '@/ui/parts';
import { useGo } from '../nav';
import { PageHeader } from '../parts';
import { useChild } from './context';

function handInChip(hw: Homework) {
  if (hw.hand_in?.status === 'checked') return <Chip label="Checked" tone="ok" />;
  if (hw.hand_in) return <Chip label="Handed in" tone="ok" />;
  if (!hw.open) return <Chip label="Not handed in" tone="bad" />;
  return <Chip label={dueLabel(hw.due_date, bsToday())} tone="warn" />;
}

export function ChildHomework({ root }: { root?: boolean }) {
  const { child } = useChild();
  const go = useGo();
  const [state, setState] = useState<'open' | 'past'>('open');
  const base = child ? `students/${child.id}/homework` : null;
  const open = useApi<HomeworkList>(base && state === 'open' ? `${base}?state=open` : null);
  const past = usePages<Homework>(base && state === 'past' ? `${base}?state=past` : null);
  const items = state === 'open' ? (open.data?.items ?? []) : past.items;
  const query = state === 'open' ? open : past;

  return (
    <Screen
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      header={<PageHeader title="Homework" sub={child?.name} onBack={root ? null : undefined} />}>
      <Segmented
        options={[
          { value: 'open', label: 'To do' },
          { value: 'past', label: 'Past' },
        ]}
        value={state}
        onChange={setState}
      />
      <Loaded
        query={{ ...query, data: query.data ? items : undefined }}
        empty={(list) =>
          list.length ? null : (
            <Empty
              icon="book"
              title={state === 'open' ? 'No homework to do' : 'No past homework'}
              body={state === 'open' ? 'New homework from the teachers shows here.' : undefined}
            />
          )
        }>
        {(list) => (
          <Card padded={false}>
            {list.map((hw, i) => (
              <View key={hw.id}>
                {i ? <Divider inset={70} /> : null}
                <ListRow
                  icon="book"
                  tint={hw.hand_in ? 'ok' : 'blue'}
                  title={hw.title}
                  sub={`${hw.subject} · due ${bsLong(hw.due_date)}`}
                  onPress={() => go(`/homework/${hw.id}`)}
                  trailing={handInChip(hw)}
                />
              </View>
            ))}
          </Card>
        )}
      </Loaded>
      {state === 'past' ? <LoadMore {...past} /> : null}
    </Screen>
  );
}

export function FileList({ files }: { files: FileLink[] }) {
  if (!files.length) return null;
  return (
    <Card padded={false}>
      {files.map((file, i) => (
        <View key={file.url}>
          {i ? <Divider inset={70} /> : null}
          <ListRow icon="file" title={file.name} sub="Open" onPress={() => void WebBrowser.openBrowserAsync(file.url)} />
        </View>
      ))}
    </Card>
  );
}

type Picked = { name: string; uri: string; mimeType?: string | null; file?: File };

async function append(form: FormData, picked: Picked) {
  if (Platform.OS === 'web') {
    const blob = picked.file ?? (await (await fetch(picked.uri)).blob());
    form.append('files', blob, picked.name);
  } else {
    // React Native's FormData takes a file as {uri, name, type}
    form.append('files', { uri: picked.uri, name: picked.name, type: picked.mimeType ?? 'application/octet-stream' } as never);
  }
}

export function HomeworkDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { child } = useChild();
  const write = useWrite();
  // the open list holds it; a past one is found in the past pages
  const open = useApi<HomeworkList>(child ? `students/${child.id}/homework?state=open` : null);
  const past = usePages<Homework>(child ? `students/${child.id}/homework?state=past` : null);
  const homework =
    open.data?.items.find((h) => String(h.id) === id) ?? past.items.find((h) => String(h.id) === id) ?? null;
  const [picked, setPicked] = useState<Picked[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function pickFiles() {
    const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (result.canceled) return;
    setPicked((now) => [...now, ...result.assets.map((a) => ({ name: a.name, uri: a.uri, mimeType: a.mimeType, file: a.file }))].slice(0, 10));
  }

  async function takePhoto() {
    const allowed = await ImagePicker.requestCameraPermissionsAsync();
    if (!allowed.granted) {
      setError('Allow the camera in the phone’s settings to take a photo of the work.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPicked((now) =>
      [...now, { name: asset.fileName ?? `photo-${now.length + 1}.jpg`, uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', file: asset.file }].slice(0, 10),
    );
  }

  async function handIn() {
    if (!child || !homework || !picked.length) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      for (const file of picked) await append(form, file);
      await write(`students/${child.id}/homework/${homework.id}/hand-in`, 'POST', form);
      setPicked([]);
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 0 ? 'No connection. Hand it in again when you are online.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen header={<PageHeader title={homework?.title ?? 'Homework'} sub={homework ? `${homework.subject} · ${homework.teacher}` : undefined} />}>
      {!homework ? (
        <Loaded query={{ ...open, data: undefined }}>{() => null}</Loaded>
      ) : (
        <>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.md }}>
              <T v="smallStrong" tone="soft">
                {`Due ${bsLong(homework.due_date)}`}
              </T>
              {handInChip(homework)}
            </View>
            <T>{homework.description}</T>
          </Card>
          <FileList files={homework.files} />
          {homework.hand_in ? (
            <>
              <SectionLabel>Handed in</SectionLabel>
              <Card>
                <T v="small" tone="quiet">
                  {`On ${bsLong(homework.hand_in.submitted_date)}`}
                </T>
                {homework.hand_in.remarks ? (
                  <>
                    <T v="smallStrong" tone="soft">
                      The teacher wrote
                    </T>
                    <T>{homework.hand_in.remarks}</T>
                  </>
                ) : null}
              </Card>
              <FileList files={homework.hand_in.files} />
            </>
          ) : homework.open ? (
            <>
              <SectionLabel>Hand it in</SectionLabel>
              {done ? <Banner tone="ok">Handed in. The teacher can see it now.</Banner> : null}
              {error ? <Banner tone="bad">{error}</Banner> : null}
              <Card>
                <T v="small" tone="quiet">
                  Add up to 10 files: photos of the work, PDFs or documents.
                </T>
                {picked.map((file, i) => (
                  <View key={`${file.uri}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <T style={{ flex: 1 }} numberOfLines={1}>
                      {file.name}
                    </T>
                    <Button title="Remove" kind="quiet" onPress={() => setPicked((now) => now.filter((_, j) => j !== i))} />
                  </View>
                ))}
                <View style={{ flexDirection: 'row', gap: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Add files" kind="secondary" icon="paperclip" onPress={() => void pickFiles()} />
                  </View>
                  {Platform.OS !== 'web' ? (
                    <View style={{ flex: 1 }}>
                      <Button title="Take photo" kind="secondary" icon="image" onPress={() => void takePhoto()} />
                    </View>
                  ) : null}
                </View>
                <Button title="Hand in" icon="upload" busy={busy} disabled={!picked.length} onPress={() => void handIn()} />
              </Card>
            </>
          ) : (
            <Banner tone="bad">The due date has passed, so this can no longer be handed in.</Banner>
          )}
        </>
      )}
    </Screen>
  );
}
