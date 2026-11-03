import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { mediaCacheKey, useMediaUrl } from '@/lib/media';

import type { SymFocus } from './types';

/** Zoom tối đa — giống web, vùng nhỏ hơn vẫn chừa chút xung quanh cho dễ định hướng. */
const MAX_ZOOM = 2.6;

/**
 * Tranh của unit, tự zoom vào vùng câu đang nói tới (người, phía sau, bên trái…). Bản mobile của
 * FocusPicture bên class-fe: cùng công thức, chỉ khác là translate tính bằng px quanh tâm khung.
 *
 * Gốc transform của RN là TÂM khung: p' = c + s·(p − c) + t. Muốn tâm vùng f về giữa khung:
 * t = −s·(f − c), rồi kẹp |t| ≤ c·(s − 1) để mép ảnh không lộ nền.
 */
export function FocusPicture({
  imageUrl,
  focus,
  label,
  maxHeight = 240,
}: {
  imageUrl?: string;
  focus?: SymFocus | null;
  label?: string;
  maxHeight?: number;
}) {
  const uri = useMediaUrl(imageUrl);
  const [ratio, setRatio] = useState(4 / 3);
  const [box, setBox] = useState({ width: 0, height: 0 });

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  let target = { s: 1, x: 0, y: 0 };
  if (focus && box.width > 0) {
    const s = Math.min(MAX_ZOOM, 100 / focus.w, 100 / focus.h);
    if (s > 1.05) {
      const cx = box.width / 2;
      const cy = box.height / 2;
      const fx = ((focus.x + focus.w / 2) / 100) * box.width;
      const fy = ((focus.y + focus.h / 2) / 100) * box.height;
      const clamp = (v: number, c: number) => Math.max(-c * (s - 1), Math.min(c * (s - 1), v));
      target = { s, x: clamp(-s * (fx - cx), cx), y: clamp(-s * (fy - cy), cy) };
    }
  }
  const zoomed = target.s > 1;

  useEffect(() => {
    const cfg = { duration: 650, easing: Easing.out(Easing.cubic) };
    scale.value = withTiming(target.s, cfg);
    tx.value = withTiming(target.x, cfg);
    ty.value = withTiming(target.y, cfg);
  }, [target.s, target.x, target.y, scale, tx, ty]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  if (!imageUrl) return null;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== box.width || height !== box.height) setBox({ width, height });
  };

  return (
    <View className="items-center rounded-2xl border border-border bg-surface-muted p-2">
      <View
        onLayout={onLayout}
        className="w-full overflow-hidden rounded-xl bg-surface"
        style={{ aspectRatio: ratio, maxWidth: Math.round(maxHeight * ratio) }}>
        {uri ? (
          <Animated.View style={[{ width: '100%', height: '100%' }, animated]}>
            <Image
              source={{ uri, cacheKey: mediaCacheKey(imageUrl) }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
              onLoad={(e) => {
                const { width, height } = e.source;
                if (width && height) setRatio(width / height);
              }}
            />
          </Animated.View>
        ) : null}
        {zoomed && label ? (
          <View className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-1">
            <Text className="text-[10px] font-bold uppercase tracking-wide text-white">{label}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
