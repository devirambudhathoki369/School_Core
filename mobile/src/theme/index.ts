import { useColorScheme } from 'react-native';

// Himalayan blue and marigold (mobile/SPEC.md §7): calm pages, a navy header,
// blue for actions and the current tab, marigold for a few highlights.
const light = {
  page: '#F5F7FC',
  card: '#FFFFFF',
  cardAlt: '#F0F3FA',
  line: '#E2E7F2',
  lineStrong: '#CBD3E4',
  text: '#0F1733',
  textSoft: '#374163',
  textQuiet: '#5C6585',
  textFaint: '#9AA3BD',
  header: '#142B6F',
  onHeader: '#FFFFFF',
  onHeaderSoft: 'rgba(255,255,255,0.82)',
  onHeaderEdge: 'rgba(255,255,255,0.22)',
  blue: '#1F44C2',
  bluePressed: '#18379F',
  blueText: '#1A3699',
  blueTint: '#E8EDFF',
  onBlue: '#FFFFFF',
  marigold: '#F5A524',
  marigoldText: '#8F5600',
  marigoldTint: '#FFF1D6',
  onMarigold: '#142B6F',
  ok: '#12805C',
  okTint: '#E1F5EC',
  bad: '#C8372D',
  badTint: '#FDE9E6',
};

export type Palette = typeof light;

const dark: Palette = {
  page: '#0A0F1F',
  card: '#121A30',
  cardAlt: '#18223D',
  line: '#232E4C',
  lineStrong: '#33405F',
  text: '#E9EDF8',
  textSoft: '#BEC6DD',
  textQuiet: '#8C96B3',
  textFaint: '#5D6787',
  header: '#0E1C4A',
  onHeader: '#FFFFFF',
  onHeaderSoft: 'rgba(255,255,255,0.8)',
  onHeaderEdge: 'rgba(255,255,255,0.2)',
  blue: '#6F8CFF',
  bluePressed: '#8DA3FF',
  blueText: '#A3B5FF',
  blueTint: '#1A2550',
  onBlue: '#0A0F1F',
  marigold: '#F5A524',
  marigoldText: '#F7C46A',
  marigoldTint: '#2C2412',
  onMarigold: '#0E1C4A',
  ok: '#4CC59A',
  okTint: '#0F2A22',
  bad: '#F07065',
  badTint: '#2E1614',
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { control: 14, card: 18, sheet: 28, pill: 999 } as const;

export const font = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  heavy: 'PlusJakartaSans_800ExtraBold',
} as const;

export const type = {
  display: { fontFamily: font.heavy, fontSize: 30, lineHeight: 36, letterSpacing: -0.5 },
  title: { fontFamily: font.heavy, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  heading: { fontFamily: font.bold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, letterSpacing: 0.5 },
} as const;
