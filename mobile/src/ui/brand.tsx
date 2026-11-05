import { StyleSheet, Text, View } from 'react-native';

import { font, usePalette } from './theme';

/** The SchoolCore letter mark: a flat brand square with an "S". */
export function BrandMark({ size = 48 }: { size?: number }) {
  const c = usePalette();
  return (
    <View
      style={[
        styles.mark,
        { width: size, height: size, borderRadius: size * 0.26, backgroundColor: c.brand },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Text style={{ color: c.onBrand, fontFamily: font.display, fontSize: size * 0.56, lineHeight: size * 0.7 }}>
        S
      </Text>
    </View>
  );
}

export function Wordmark() {
  const c = usePalette();
  return (
    <View style={styles.row}>
      <BrandMark size={36} />
      <Text style={{ fontFamily: font.display, fontSize: 22, color: c.ink }}>
        School<Text style={{ color: c.brand }}>Core</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
