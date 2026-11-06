import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setFullscreenResume, SubmissionVideoPlayer } from '@/components/ui/submission-video-player';

/**
 * Xem video bài nộp toàn màn hình, xoay NGANG như YouTube (Stack khai báo `orientation: 'landscape'`
 * ở _layout; các màn khác khoá dọc). Mở từ nút ⤢ trên SubmissionVideoPlayer, hoặc nút toàn màn hình
 * của Bunny. Đóng → ghi giây đang xem để trình phát ở màn trước xem tiếp đúng chỗ.
 */
export default function VideoFullscreenScreen() {
  const { key, start } = useLocalSearchParams<{ key: string; start?: string }>();
  const insets = useSafeAreaInsets();
  const [startAt] = useState(() => Math.max(0, Number(start) || 0));
  const last = useRef(startAt);

  useEffect(() => () => setFullscreenResume(key, last.current), [key]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', paddingLeft: insets.left, paddingRight: insets.right }}>
      {key ? (
        <SubmissionVideoPlayer
          videoKey={key}
          start={startAt}
          fill
          autoPlay
          onTime={(t) => {
            last.current = t;
          }}
        />
      ) : null}
      <Pressable
        onPress={() => router.back()}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Thoát toàn màn hình"
        className="absolute h-10 w-10 items-center justify-center rounded-full active:opacity-70"
        style={{ top: 12 + insets.top, left: 12 + insets.left, backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Ionicons name="contract" size={20} color="#fff" />
      </Pressable>
    </View>
  );
}
