import { useColorScheme } from 'react-native';

// The Ocean look of the web portal (frontend/src/styles/globals.css, the
// `classic` theme): neutral pages, the brand colour only on actions, the
// active item and chosen things. Flat surfaces, no gradients.
const light = {
  canvas: '#EFF7FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F9FAFB',
  line: '#E4E7EC',
  lineStrong: '#D0D5DD',
  ink: '#101828',
  inkSoft: '#344054',
  inkMuted: '#667085',
  brand: '#037177',
  brandPressed: '#015A5D',
  brandInk: '#015A5D',
  brandTint: '#EBFAFE',
  brandTintStrong: '#D4F5FC',
  brandLine: '#B2EBF6',
  onBrand: '#FFFFFF',
  mark: '#CD8000',
  markTint: '#FEEAD2',
  markInk: '#8E5400',
  ok: '#0B7A5C',
  okTint: '#E3F4EE',
  warn: '#8A5A00',
  warnTint: '#FDF1DC',
  bad: '#B42318',
  badTint: '#FDECEA',
  off: '#98A2B3',
  offTint: '#F2F4F7',
};

export type Palette = typeof light;

const dark: Palette = {
  canvas: '#0B1217',
  surface: '#121B22',
  surfaceAlt: '#16212A',
  line: '#22303A',
  lineStrong: '#31414D',
  ink: '#E7EEF2',
  inkSoft: '#C2CED6',
  inkMuted: '#8C9BA7',
  brand: '#38B5BB',
  brandPressed: '#5CC7CC',
  brandInk: '#7FD7DB',
  brandTint: '#0E272B',
  brandTintStrong: '#123539',
  brandLine: '#1D4B50',
  onBrand: '#032628',
  mark: '#E5A93A',
  markTint: '#2B2111',
  markInk: '#F0C26E',
  ok: '#4CC59A',
  okTint: '#0F2A20',
  warn: '#E5A93A',
  warnTint: '#2B2111',
  bad: '#F07065',
  badTint: '#2F1614',
  off: '#6B7A86',
  offTint: '#1A242C',
};

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

// Loaded in the root layout (@expo-google-fonts), the faces the portal uses.
export const font = {
  display: 'BricolageGrotesque_700Bold',
  displayMedium: 'BricolageGrotesque_600SemiBold',
  regular: 'HankenGrotesk_400Regular',
  medium: 'HankenGrotesk_500Medium',
  semibold: 'HankenGrotesk_600SemiBold',
  bold: 'HankenGrotesk_700Bold',
} as const;

export const type = {
  title: { fontFamily: font.display, fontSize: 28, lineHeight: 34 },
  heading: { fontFamily: font.displayMedium, fontSize: 20, lineHeight: 26 },
  subheading: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  smallStrong: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: font.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  figure: { fontFamily: font.display, fontSize: 30, lineHeight: 36 },
} as const;
