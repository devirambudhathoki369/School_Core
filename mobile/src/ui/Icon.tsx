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
  | 'backspace';

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
