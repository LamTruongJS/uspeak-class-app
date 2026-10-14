import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { ChatMessage } from './types';

/** Kéo quá ngưỡng này (px) rồi thả là trả lời. */
const TRIGGER = 56;
/** Kéo tối đa (có lực cản sau ngưỡng) */
const MAX = 90;

function hapticTick() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/**
 * Vuốt tin sang phải để trả lời — như Messenger/Zalo/Telegram.
 * Chỉ nhận vuốt NGANG sang phải (activeOffsetX 12px), lệch dọc 10px là nhường cho danh sách cuộn,
 * nên không cản việc cuộn tin hay nhấn giữ mở menu. Chạy trên UI thread (reanimated) để mượt.
 *
 * onReply phải là hàm ổn định (màn phòng truyền useStableCallback) và nhận tin qua tham số: React Compiler
 * chỉ giữ nguyên gesture khi đầu vào không đổi — closure () => onReply(m) mới mỗi lần thì GestureDetector
 * phải gắn lại handler native ở mọi lần vẽ.
 */
export function SwipeToReply({
  enabled,
  onReply,
  message,
  brand,
  children,
}: {
  enabled: boolean;
  onReply: (m: ChatMessage) => void;
  message: ChatMessage;
  brand: string;
  children: ReactNode;
}) {
  const x = useSharedValue(0);
  const armed = useSharedValue(false);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .activeOffsetX(12)
    .failOffsetX(-12)
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      const dx = Math.max(0, e.translationX);
      // Sau ngưỡng thì kéo nặng tay hơn (lực cản), không trượt mãi
      x.value = dx <= TRIGGER ? dx : Math.min(MAX, TRIGGER + (dx - TRIGGER) * 0.35);
      const over = dx >= TRIGGER;
      if (over !== armed.value) {
        armed.value = over;
        if (over) scheduleOnRN(hapticTick);
      }
    })
    .onEnd(() => {
      if (armed.value) scheduleOnRN(onReply, message);
      armed.value = false;
      x.value = withSpring(0, { damping: 18, stiffness: 220 });
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const iconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [10, TRIGGER], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(x.value, [10, TRIGGER], [0.5, 1], 'clamp') }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View>
        <Animated.View style={[{ position: 'absolute', left: 4, top: 0, bottom: 0, justifyContent: 'center' }, iconStyle]}>
          <View className="h-8 w-8 items-center justify-center rounded-full bg-brand-soft">
            <Ionicons name="arrow-undo" size={16} color={brand} />
          </View>
        </Animated.View>
        <Animated.View style={rowStyle}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}
