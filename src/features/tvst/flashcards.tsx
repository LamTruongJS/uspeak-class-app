import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Segmented } from '@/components/ui/segmented';
import { useThemeColor } from '@/theme/use-theme-color';

import type { TvstAudio } from './audio';
import type { TvstBizChunk } from './types';

/**
 * STEP 3 — thẻ cụm từ (bản mobile của FlashcardPanel web): chạm để lật, mỗi mặt có nút đọc, đổi chiều
 * Anh→Việt / Việt→Anh, trộn thẻ, đếm số thẻ đã lật.
 */
type Direction = 'en-vi' | 'vi-en';

export function FlashcardPanel({ items, audio }: { items: TvstBizChunk[]; audio: TvstAudio }) {
  const brand = useThemeColor('brand');
  const [direction, setDirection] = useState<Direction>('en-vi');
  const [flipped, setFlipped] = useState<Set<number>>(() => new Set());
  const [seen, setSeen] = useState<Set<number>>(() => new Set());
  const [order, setOrder] = useState<number[]>(() => items.map((_, i) => i));

  const flip = (i: number) => {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
    setSeen((prev) => new Set(prev).add(i));
  };

  const shuffle = () => {
    setFlipped(new Set());
    setOrder((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
  };

  if (!items.length) return <Text className="py-8 text-center text-[13px] text-muted">Unit này chưa có thẻ cụm từ.</Text>;

  const front: 'en' | 'vi' = direction === 'en-vi' ? 'en' : 'vi';
  const back: 'en' | 'vi' = front === 'en' ? 'vi' : 'en';

  return (
    <View className="gap-3">
      <Segmented
        items={[
          { value: 'en-vi', label: 'Anh → Việt' },
          { value: 'vi-en', label: 'Việt → Anh' },
        ]}
        value={direction}
        onChange={(d) => {
          setDirection(d);
          setFlipped(new Set());
        }}
      />
      <View className="flex-row items-center justify-between">
        <Text className="text-[12.5px] font-semibold text-muted">
          Đã lật {seen.size}/{items.length} thẻ · chạm thẻ để lật
        </Text>
        <Pressable onPress={shuffle} className="flex-row items-center gap-1 rounded-full bg-surface-muted px-3 py-1.5">
          <Ionicons name="shuffle" size={14} color={brand} />
          <Text className="text-[12px] font-bold text-brand">Trộn thẻ</Text>
        </Pressable>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {order.map((i) => {
          const item = items[i];
          const isBack = flipped.has(i);
          const lang = isBack ? back : front;
          const key = `card-${i}-${lang}`;
          const url = lang === 'en' ? item.audioEn : item.audioVi;
          return (
            <Pressable
              key={i}
              onPress={() => flip(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: isBack }}
              className={`min-h-[96px] w-[48.5%] justify-between gap-2 rounded-2xl border p-3 active:opacity-80 ${
                isBack ? 'border-brand bg-brand' : 'border-border bg-surface'
              }`}>
              <Text className={`text-[15px] font-bold leading-5 ${isBack ? 'text-on-brand' : lang === 'en' ? 'text-brand' : 'text-foreground'}`}>
                {lang === 'en' ? item.en : item.vi}
              </Text>
              <View className="flex-row items-end justify-between gap-1">
                <Text className={`flex-1 text-[11.5px] ${isBack ? 'text-on-brand opacity-80' : 'text-muted'}`} numberOfLines={1}>
                  {lang === 'en' ? (item.ipa ?? '') : ''}
                </Text>
                {url ? (
                  <Pressable hitSlop={8} onPress={() => audio.toggle(url, key)}>
                    <Ionicons name={audio.playingKey === key ? 'pause-circle' : 'volume-high'} size={18} color={isBack ? '#ffffff' : brand} />
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
