import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { useThemeColor } from '@/theme/use-theme-color';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

const HEIGHT = 200;
const PAD_LEFT = 28;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

/**
 * Vạch trục Y: bước "đẹp" (1, 2, 5, 10, 20, 50, 100…) cho ~4 khoảng, đỉnh trục làm tròn lên bội
 * của bước gần nhất — vd đỉnh dữ liệu 230 → 0/100/200/300 (không phải 0…500 làm biểu đồ dẹt).
 */
function yTicks(maxValue: number) {
  const raw = Math.max(1, maxValue) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow);
  const top = Math.max(step, Math.ceil(maxValue / step) * step);
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/**
 * Biểu đồ vùng nhiều đường (thay recharts AreaChart của web — RN không chạy được recharts).
 * Chạm vào biểu đồ để xem số của cột đó (thay cho tooltip hover trên web).
 */
export function AreaChart({ labels, series }: { labels: string[]; series: ChartSeries[] }) {
  const border = useThemeColor('border');
  const muted = useThemeColor('muted');
  const surface = useThemeColor('surface');
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);

  const n = labels.length;
  const grid = yTicks(Math.max(0, ...series.flatMap((s) => s.values)));
  const max = grid[grid.length - 1];
  const plotW = Math.max(0, width - PAD_LEFT - PAD_RIGHT);
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const x = (i: number) => PAD_LEFT + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD_TOP + plotH - (v / max) * plotH;

  // Đường cong mượt không vượt đỉnh: điểm điều khiển nằm giữa 2 điểm theo trục X, giữ nguyên Y.
  const linePath = (vals: number[]) =>
    vals.reduce((d, v, i) => {
      if (i === 0) return `M${x(0)},${y(v)}`;
      const mx = (x(i - 1) + x(i)) / 2;
      return `${d} C${mx},${y(vals[i - 1])} ${mx},${y(v)} ${x(i)},${y(v)}`;
    }, '');
  const areaPath = (vals: number[]) => `${linePath(vals)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`;

  // Nhãn trục X: tối đa 5 nhãn cách đều (luôn có điểm đầu + cuối) để không chồng nhau trên điện thoại
  // Ưu tiên số nhãn chia đều được (7 điểm → 4 nhãn: 0,2,4,6); không có thì 5 nhãn làm tròn
  const labelCount = n <= 5 ? n : ([5, 4, 3].find((c) => (n - 1) % (c - 1) === 0) ?? 5);
  const shownLabels = new Set(
    Array.from({ length: labelCount }, (_, i) => (labelCount <= 1 ? 0 : Math.round((i * (n - 1)) / (labelCount - 1)))),
  );

  return (
    <View>
      {/* Chú thích + số của cột đang chọn */}
      <View className="mb-2 flex-row flex-wrap items-center gap-x-3 gap-y-1">
        {selected !== null ? <Text className="text-xs font-bold text-foreground">{labels[selected]}:</Text> : null}
        {series.map((s) => (
          <View key={s.key} className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            <Text className="text-xs text-muted">
              {s.label}
              {selected !== null ? <Text className="font-bold text-foreground"> {s.values[selected] ?? 0}</Text> : null}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPress={(e) => {
          if (n === 0 || plotW <= 0) return;
          const rel = (e.nativeEvent.locationX - PAD_LEFT) / plotW;
          const i = Math.round(Math.min(1, Math.max(0, rel)) * (n - 1));
          setSelected((cur) => (cur === i ? null : i));
        }}
        style={{ height: HEIGHT }}>
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            <Defs>
              {series.map((s) => (
                <LinearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0.05" stopColor={s.color} stopOpacity={0.25} />
                  <Stop offset="0.95" stopColor={s.color} stopOpacity={0} />
                </LinearGradient>
              ))}
            </Defs>
            {grid.map((g) => (
              <Line
                key={g}
                x1={PAD_LEFT}
                x2={width - PAD_RIGHT}
                y1={y(g)}
                y2={y(g)}
                stroke={border}
                strokeDasharray="3 3"
                strokeWidth={1}
              />
            ))}
            {selected !== null ? <Line x1={x(selected)} x2={x(selected)} y1={PAD_TOP} y2={y(0)} stroke={muted} strokeWidth={1} /> : null}
            {series.map((s) => (
              <Path key={`a-${s.key}`} d={areaPath(s.values)} fill={`url(#fill-${s.key})`} />
            ))}
            {series.map((s) => (
              <Path key={`l-${s.key}`} d={linePath(s.values)} stroke={s.color} strokeWidth={2} fill="none" />
            ))}
            {selected !== null
              ? series.map((s) => (
                  <Circle
                    key={`d-${s.key}`}
                    cx={x(selected)}
                    cy={y(s.values[selected] ?? 0)}
                    r={4.5}
                    fill={s.color}
                    stroke={surface}
                    strokeWidth={2}
                  />
                ))
              : null}
          </Svg>
        ) : null}
        {/* Nhãn trục — dùng Text của RN (font hệ thống, tự theo dark mode) đè lên SVG */}
        {width > 0
          ? grid.map((g) => (
              <Text
                key={`y-${g}`}
                className="absolute text-[10px] text-muted"
                style={{ left: 0, width: PAD_LEFT - 4, top: y(g) - 7, textAlign: 'right' }}>
                {g}
              </Text>
            ))
          : null}
        {width > 0
          ? labels.map((l, i) =>
              shownLabels.has(i) ? (
                <Text
                  key={`x-${i}`}
                  className="absolute text-[10px] text-muted"
                  style={{ left: x(i) - 30, width: 60, top: HEIGHT - 16, textAlign: 'center' }}
                  numberOfLines={1}>
                  {l}
                </Text>
              ) : null,
            )
          : null}
      </Pressable>
    </View>
  );
}
