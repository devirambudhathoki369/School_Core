import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, usePalette } from '@/theme';
import { Icon } from '@/ui/Icon';
import { Mark } from '@/ui/Mark';
import { T } from '@/ui/kit';

export function UpdateRequired({ message }: { message: string }) {
  const c = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.header,
        paddingTop: insets.top + space.xxxl,
        paddingHorizontal: space.xxl,
        alignItems: 'center',
        gap: space.lg,
      }}>
      <Mark size={56} onDark />
      <Icon name="download" size={32} color={c.marigold} />
      <T v="title" tone="onHeader" center>
        Time to update
      </T>
      <T tone="onHeaderSoft" center>
        {message}
      </T>
      <T tone="onHeaderSoft" center>
        Open the Play Store or the App Store and update SchoolCore.
      </T>
    </View>
  );
}
