import { useState } from 'react';
import { Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useThemeColor } from '@/theme/use-theme-color';

/** Màu theo % điểm — giống getSliderColor của web chấm bài. */
export function scoreTone(score: number, max: number) {
  if (!score) return { bar: 'bg-border', text: 'text-muted' };
  const pct = (score / max) * 100;
  if (pct >= 75) return { bar: 'bg-success', text: 'text-success' };
  if (pct >= 60) return { bar: 'bg-warning', text: 'text-warning' };
  return { bar: 'bg-danger', text: 'text-danger' };
}

/**
 * Thanh kéo điểm bước 0,5 (web dùng Slider step 0.5) + nút −/+ cho chỉnh chính xác bằng 1 ngón.
 * Tự viết bằng responder thay vì thêm thư viện slider (giữ Expo Go chạy được).
 */
export function ScoreSlider({ value, max, onChange }: { value: number; max: number; onChange: (v: number) => void }) {
  const [width, setWidth] = useState(0);
  const fg = useThemeColor('foreground');
  const tone = scoreTone(value, max);
  const pct = max ? Math.min(100, (value / max) * 100) : 0;

  const fromX = (e: GestureResponderEvent) => {
    if (!width) return;
    const x = Math.max(0, Math.min(width, e.nativeEvent.locationX));
    onChange(Math.round((x / width) * max * 2) / 2);
  };
  const step = (d: number) => onChange(Math.max(0, Math.min(max, Math.round((value + d) * 2) / 2)));

  return (
    <View className="flex-row items-center gap-3">
      <Pressable
        onPress={() => step(-0.5)}
        hitSlop={6}
        accessibilityLabel="Giảm 0,5"
        className="h-9 w-9 items-center justify-center rounded-full bg-surface-muted active:opacity-60">
        <Ionicons name="remove" size={18} color={fg} />
      </Pressable>
      <View
        className="h-9 flex-1 justify-center"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        // Đang kéo thì không nhường cho ScrollView cuộn
        onResponderTerminationRequest={() => false}
        onResponderGrant={fromX}
        onResponderMove={fromX}>
        <View pointerEvents="none" className="h-2 overflow-hidden rounded-full bg-surface-muted">
          <View className={`h-full rounded-full ${tone.bar}`} style={{ width: `${pct}%` }} />
        </View>
        <View
          pointerEvents="none"
          className="absolute h-6 w-6 rounded-full border-[3px] border-surface bg-foreground"
          style={{ left: Math.max(0, (width - 24) * (pct / 100)), elevation: 2 }}
        />
      </View>
      <Pressable
        onPress={() => step(0.5)}
        hitSlop={6}
        accessibilityLabel="Tăng 0,5"
        className="h-9 w-9 items-center justify-center rounded-full bg-surface-muted active:opacity-60">
        <Ionicons name="add" size={18} color={fg} />
      </Pressable>
      <Text className={`w-14 text-right text-[17px] font-extrabold ${tone.text}`}>
        {value ? value : '—'}
        <Text className="text-[12px] font-semibold text-muted">/{max}</Text>
      </Text>
    </View>
  );
}
