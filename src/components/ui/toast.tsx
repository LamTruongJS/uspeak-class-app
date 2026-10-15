import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState, type ComponentProps } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { useThemeColor, type ThemeColor } from '@/theme/use-theme-color';

type IconName = ComponentProps<typeof Ionicons>['name'];
export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
  /** Mặc định 3,2 giây; đặt 0 để chỉ tắt khi người dùng chạm. */
  duration?: number;
  /** Nút bên phải, VD "Mở Cài đặt" — cho việc cần một cú chạm chứ không đáng mở hộp thoại. */
  action?: { label: string; onPress: () => void };
}

/** Tuỳ chọn thêm; truyền thẳng một số thì hiểu là `duration` (giữ cách gọi cũ). */
export type ToastExtra = number | { duration?: number; action?: ToastItem['action'] };

interface ToastState {
  items: ToastItem[];
  remove: (id: number) => void;
}

const useToastStore = create<ToastState>((set) => ({
  items: [],
  remove: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

let seq = 0;

/**
 * Báo một việc đã xong / không xong mà KHÔNG chặn người dùng.
 *
 * Dùng thay `Alert.alert` một nút: hộp thoại hệ thống bắt người ta bấm "OK" chỉ để đọc một câu,
 * lại mang giao diện mặc định của máy chứ không phải của app. Việc cần người CHỌN thì vẫn dùng
 * `useActionSheet()` (`components/ui/action-sheet.tsx`).
 *
 * Gọi được từ bất cứ đâu (kể cả ngoài component) vì đây là store, không phải hook.
 */
export function showToast(tone: ToastTone, title: string, message?: string, extra?: ToastExtra) {
  seq += 1;
  const more = typeof extra === 'number' ? { duration: extra } : (extra ?? {});
  const item: ToastItem = { id: seq, tone, title, message, ...more };
  useToastStore.setState((s) => ({ items: [...s.items.slice(-2), item] }));
  return item.id;
}

const TONE: Record<ToastTone, { icon: IconName; color: ThemeColor; box: string }> = {
  success: { icon: 'checkmark-circle', color: 'success', box: 'bg-success-soft' },
  error: { icon: 'alert-circle', color: 'danger', box: 'bg-danger-soft' },
  warning: { icon: 'warning', color: 'warning', box: 'bg-warning-soft' },
  info: { icon: 'information-circle', color: 'info', box: 'bg-info-soft' },
};

/**
 * Khay thông báo — gắn MỘT LẦN ở `app/_layout.tsx`, nổi trên mọi màn kể cả modal của navigation.
 * `pointerEvents="box-none"` để vùng trống không nuốt thao tác của màn bên dưới.
 */
export function Toaster() {
  const insets = useSafeAreaInsets();
  const items = useToastStore((s) => s.items);
  if (!items.length) return null;
  return (
    <View pointerEvents="box-none" className="absolute left-0 right-0 z-50 gap-2 px-3" style={{ top: insets.top + 8 }}>
      {items.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </View>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  const remove = useToastStore((s) => s.remove);
  const tone = TONE[item.tone];
  const color = useThemeColor(tone.color);
  // useState chứ không useRef: React Compiler cấm đọc `.current` lúc render
  // (cùng cách làm với `collapsing-header.tsx`).
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 180 }).start();
    const ms = item.duration ?? 3200;
    if (!ms) return;
    const timer = setTimeout(() => {
      // Trượt lên rồi mới gỡ khỏi danh sách — gỡ thẳng thì thẻ biến mất giật cục.
      Animated.timing(anim, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => remove(item.id));
    }, ms);
    return () => clearTimeout(timer);
  }, [anim, item.duration, item.id, remove]);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }],
        shadowColor: '#000',
        shadowOpacity: 0.16,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
      }}>
      <Pressable
        onPress={() => remove(item.id)}
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. Chạm để đóng.`}
        className={`flex-row items-start gap-2.5 rounded-2xl border border-border bg-surface px-3.5 py-3 active:opacity-80`}>
        <View className={`h-7 w-7 items-center justify-center rounded-full ${tone.box}`}>
          <Ionicons name={tone.icon} size={17} color={color} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-[14.5px] font-bold text-foreground">{item.title}</Text>
          {item.message ? <Text className="text-[12.5px] leading-[17px] text-muted">{item.message}</Text> : null}
        </View>
        {item.action ? (
          <Pressable
            onPress={() => {
              remove(item.id);
              item.action?.onPress();
            }}
            accessibilityRole="button"
            hitSlop={6}
            className="self-center rounded-full bg-surface-muted px-3 py-1.5 active:opacity-70">
            <Text className="text-[12.5px] font-bold" style={{ color }}>
              {item.action.label}
            </Text>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
