import { Image } from 'expo-image';

import { mediaUrl } from '@/api/client';
import { useMe, useNotices } from '@/api/queries';
import { bsLong } from '@/lib/format';
import { Card, Empty, Failed, Loading, Screen, T } from '@/ui/kit';
import { radius } from '@/ui/theme';

export default function Notices() {
  const { me, isLoading, error, refetch } = useMe();
  const query = useNotices(me);

  if (isLoading) return <Screen edges={[]}><Loading /></Screen>;
  if (!me) return <Screen edges={[]}><Failed error={error} onRetry={() => refetch()} /></Screen>;
  const notices = query.data?.results ?? [];

  return (
    <Screen edges={[]} onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <Failed error={query.error} onRetry={() => query.refetch()} />
      ) : notices.length === 0 ? (
        <Empty icon="bell" title="No notices" body="Notices from the school appear here." />
      ) : (
        notices.map((n) => {
          const image = mediaUrl(n.image);
          return (
            <Card key={n.id}>
              <T v="small" tone="muted">
                {bsLong(n.date)}
              </T>
              <T v="subheading">{n.title}</T>
              {n.description ? (
                <T tone="soft" selectable>
                  {n.description}
                </T>
              ) : null}
              {image ? (
                <Image
                  source={image}
                  style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.sm }}
                  contentFit="cover"
                  accessibilityLabel={n.title}
                />
              ) : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
