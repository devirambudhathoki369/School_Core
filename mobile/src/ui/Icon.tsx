import { Platform } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

// One outline set at 2 px; the main shape carries a soft fill of the same
// colour (duotone). `filled` raises that fill, for the current tab.
export type IconName =
  | 'parent'
  | 'student'
  | 'staff'
  | 'admin'
  | 'home'
  | 'grid'
  | 'school'
  | 'mail'
  | 'key'
  | 'lock'
  | 'unlock'
  | 'phone'
  | 'logout'
  | 'plus'
  | 'check'
  | 'alert'
  | 'chevron-right'
  | 'chevron-left'
  | 'eye'
  | 'eye-off'
  | 'fingerprint'
  | 'swap'
  | 'refresh'
  | 'download'
  | 'backspace'
  | 'calendar'
  | 'wallet'
  | 'book'
  | 'award'
  | 'clock'
  | 'bell'
  | 'users'
  | 'x'
  | 'paperclip'
  | 'file'
  | 'upload'
  | 'send'
  | 'search'
  | 'wifi-off'
  | 'list'
  | 'sun'
  | 'receipt'
  | 'chart'
  | 'edit'
  | 'image';

// Icons are decoration; the button or row around them carries the label.
const HIDDEN =
  Platform.OS === 'web'
    ? { 'aria-hidden': true }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no' as const };

export function Icon({
  name,
  size = 22,
  color,
  filled = false,
}: {
  name: IconName;
  size?: number;
  color: string;
  filled?: boolean;
}) {
  const fill = { fill: color, fillOpacity: filled ? 0.28 : 0.16 };
  const none = { fill: 'none' };
  const stroke = { stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" {...stroke} {...none} {...HIDDEN}>
      {paths(name, fill)}
    </Svg>
  );
}

function paths(name: IconName, fill: { fill: string; fillOpacity: number }) {
  switch (name) {
    case 'parent':
      return (
        <>
          <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" {...fill} />
          <Circle cx={9} cy={7} r={4} {...fill} />
          <Path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <Path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      );
    case 'student':
      return (
        <>
          <Path d="M22 10 12 5 2 10l10 5 10-5z" {...fill} />
          <Path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" />
        </>
      );
    case 'staff':
      return (
        <>
          <Rect x={2} y={7} width={20} height={14} rx={2} {...fill} />
          <Path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        </>
      );
    case 'admin':
      return (
        <>
          <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" {...fill} />
          <Path d="m9 12 2 2 4-4" />
        </>
      );
    case 'home':
      return (
        <>
          <Path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" {...fill} />
          <Path d="M9 22V12h6v10" />
        </>
      );
    case 'grid':
      return (
        <>
          <Rect x={3} y={3} width={7} height={7} rx={1.5} {...fill} />
          <Rect x={14} y={3} width={7} height={7} rx={1.5} {...fill} />
          <Rect x={3} y={14} width={7} height={7} rx={1.5} {...fill} />
          <Rect x={14} y={14} width={7} height={7} rx={1.5} {...fill} />
        </>
      );
    case 'school':
      return (
        <>
          <Path d="M3 21h18" />
          <Path d="M5 21V10l7-5 7 5v11" {...fill} />
          <Path d="M10 21v-5h4v5" />
        </>
      );
    case 'mail':
      return (
        <>
          <Rect x={2} y={4} width={20} height={16} rx={2} {...fill} />
          <Path d="m22 7-10 6L2 7" />
        </>
      );
    case 'key':
      return (
        <>
          <Circle cx={7.5} cy={15.5} r={5.5} {...fill} />
          <Path d="m21 2-9.6 9.6" />
          <Path d="m15.5 7.5 3 3L22 7l-3-3" />
        </>
      );
    case 'lock':
      return (
        <>
          <Rect x={3} y={11} width={18} height={11} rx={2} {...fill} />
          <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
      );
    case 'unlock':
      return (
        <>
          <Rect x={3} y={11} width={18} height={11} rx={2} {...fill} />
          <Path d="M7 11V7a5 5 0 0 1 9.9-1" />
        </>
      );
    case 'phone':
      return (
        <>
          <Rect x={6} y={2} width={12} height={20} rx={2} {...fill} />
          <Path d="M11 18h2" />
        </>
      );
    case 'logout':
      return (
        <>
          <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" {...fill} />
          <Path d="m16 17 5-5-5-5" />
          <Path d="M21 12H9" />
        </>
      );
    case 'plus':
      return <Path d="M12 5v14M5 12h14" />;
    case 'check':
      return <Path d="M20 6 9 17l-5-5" />;
    case 'alert':
      return (
        <>
          <Circle cx={12} cy={12} r={10} {...fill} />
          <Path d="M12 8v4M12 16h.01" />
        </>
      );
    case 'chevron-right':
      return <Path d="m9 18 6-6-6-6" />;
    case 'chevron-left':
      return <Path d="m15 18-6-6 6-6" />;
    case 'eye':
      return (
        <>
          <Path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" {...fill} />
          <Circle cx={12} cy={12} r={3} />
        </>
      );
    case 'eye-off':
      return (
        <>
          <Path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
          <Path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 8 10 8a9.7 9.7 0 0 0 5.39-1.61" />
          <Path d="M2 2l20 20" />
        </>
      );
    case 'fingerprint':
      return (
        <>
          <Path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" />
          <Path d="M14 13.12c0 2.38 0 6.38-1 8.88" />
          <Path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" />
          <Path d="M2 12a10 10 0 0 1 18-6" />
          <Path d="M2 16h.01" />
          <Path d="M21.8 16c.2-2 .13-5.35 0-6" />
          <Path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2" />
          <Path d="M8.65 22c.21-.66.45-1.32.57-2" />
          <Path d="M9 6.8a6 6 0 0 1 9 5.2v2" />
        </>
      );
    case 'swap':
      return (
        <>
          <Path d="m16 3 4 4-4 4" />
          <Path d="M20 7H4" />
          <Path d="m8 21-4-4 4-4" />
          <Path d="M4 17h16" />
        </>
      );
    case 'refresh':
      return (
        <>
          <Path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
          <Path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
          <Path d="M21 3v5h-5M3 21v-5h5" />
        </>
      );
    case 'backspace':
      return (
        <>
          <Path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" {...fill} />
          <Path d="m18 9-6 6M12 9l6 6" />
        </>
      );
    case 'calendar':
      return (
        <>
          <Rect x={3} y={4} width={18} height={18} rx={2} {...fill} />
          <Path d="M16 2v4M8 2v4M3 10h18" />
        </>
      );
    case 'wallet':
      return (
        <>
          <Path d="M20 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3v2a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6" {...fill} />
          <Path d="M18 12h.01" />
        </>
      );
    case 'book':
      return (
        <>
          <Path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6.5A2.5 2.5 0 0 0 4 20.5z" {...fill} />
          <Path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-4" />
          <Path d="M9 7h7" />
        </>
      );
    case 'award':
      return (
        <>
          <Circle cx={12} cy={8} r={6} {...fill} />
          <Path d="M15.5 13 17 22l-5-3-5 3 1.5-9" />
        </>
      );
    case 'clock':
      return (
        <>
          <Circle cx={12} cy={12} r={10} {...fill} />
          <Path d="M12 6v6l4 2" />
        </>
      );
    case 'bell':
      return (
        <>
          <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" {...fill} />
          <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </>
      );
    case 'users':
      return (
        <>
          <Circle cx={9} cy={7} r={4} {...fill} />
          <Path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" />
          <Path d="M16 3.13a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.85" />
        </>
      );
    case 'x':
      return <Path d="M18 6 6 18M6 6l12 12" />;
    case 'paperclip':
      return <Path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />;
    case 'file':
      return (
        <>
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" {...fill} />
          <Path d="M14 2v6h6M9 13h6M9 17h4" />
        </>
      );
    case 'upload':
      return (
        <>
          <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" {...fill} />
          <Path d="m17 8-5-5-5 5" />
          <Path d="M12 3v12" />
        </>
      );
    case 'send':
      return (
        <>
          <Path d="m22 2-7 20-4-9-9-4z" {...fill} />
          <Path d="M22 2 11 13" />
        </>
      );
    case 'search':
      return (
        <>
          <Circle cx={11} cy={11} r={7} {...fill} />
          <Path d="m21 21-4.3-4.3" />
        </>
      );
    case 'wifi-off':
      return (
        <>
          <Path d="M2 2l20 20" />
          <Path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2-1.6M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10.7 5" />
          <Path d="M12 20h.01" />
        </>
      );
    case 'list':
      return (
        <>
          <Rect x={3} y={4} width={18} height={16} rx={2} {...fill} />
          <Path d="M8 9h8M8 13h8M8 17h5" />
        </>
      );
    case 'sun':
      return (
        <>
          <Circle cx={12} cy={12} r={4} {...fill} />
          <Path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </>
      );
    case 'receipt':
      return (
        <>
          <Path d="M4 2v20l3-2 2.5 2 2.5-2 2.5 2 2.5-2 3 2V2l-3 2-2.5-2L12 4 9.5 2 7 4z" {...fill} />
          <Path d="M8 9h8M8 13h6" />
        </>
      );
    case 'chart':
      return (
        <>
          <Rect x={3} y={12} width={4} height={9} rx={1} {...fill} />
          <Rect x={10} y={7} width={4} height={14} rx={1} {...fill} />
          <Rect x={17} y={3} width={4} height={18} rx={1} {...fill} />
        </>
      );
    case 'edit':
      return (
        <>
          <Path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" {...fill} />
          <Path d="m15 5 4 4" />
        </>
      );
    case 'image':
      return (
        <>
          <Rect x={3} y={3} width={18} height={18} rx={2} {...fill} />
          <Circle cx={9} cy={9} r={2} />
          <Path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
        </>
      );
    case 'download':
      return (
        <>
          <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" {...fill} />
          <Path d="m7 10 5 5 5-5" />
          <Path d="M12 15V3" />
        </>
      );
  }
}
