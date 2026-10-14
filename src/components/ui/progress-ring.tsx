import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useThemeColor, type ThemeColor } from '@/theme/use-theme-color';

/** Vòng tiến độ (0–100) — chữ / icon ở giữa truyền qua children. */
export function ProgressRing({
  percent,
  size = 56,
  stroke = 6,
  color = 'brand',
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color?: ThemeColor;
  children?: ReactNode;
}) {
  const tint = useThemeColor(color);
  const track = useThemeColor('surface-muted');
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent)) / 100;

  return (
    <View style={{ width: size, height: size }} className="items-center justify-center">
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        {p > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={tint}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - p)}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}
