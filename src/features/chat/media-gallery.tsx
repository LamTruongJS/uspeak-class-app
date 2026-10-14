import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { FlatList, Modal, Pressable, Share, Text, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDateTime } from '@/lib/format';
import { resolveMediaUrl, thumbCacheKey, thumbMediaUrl } from '@/lib/media';

import type { RoomMediaItem } from './api';
import { VideoPlayerModal } from './message-content';
import { ZoomableImage } from './zoomable-image';

/**
 * Thư viện ảnh/video toàn màn hình kiểu Messenger: vuốt ngang chuyển ảnh, chụm/chạm đúp phóng to,
 * vuốt dọc để đóng. Thanh trên: người gửi + thời gian + "3/24"; thanh dưới: Chia sẻ · Xem trong đoạn chat.
 * Video hiện ảnh bìa + nút play, bấm thì mở trình phát (VideoPlayerModal).
 */
export function MediaGallery({
  items,
  index,
  token,
  onClose,
  onGoToMessage,
}: {
  items: RoomMediaItem[];
  /** null = đóng */
  index: number | null;
  token?: string;
  onClose: () => void;
  onGoToMessage: (messageId: string) => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(index ?? 0);
  const [zoomed, setZoomed] = useState(false);
  const [video, setVideo] = useState<string | null>(null);
  // Mở ở ảnh khác → nhảy về đúng ảnh đó (so với lần mở trước, không setState trong effect)
  const [openedAt, setOpenedAt] = useState(index);
  if (index !== openedAt) {
    setOpenedAt(index);
    if (index !== null) setCurrent(index);
  }

  if (index === null) return null;
  const item = items[current];
  const url = item ? resolveMediaUrl(item.url, token) : undefined;

  const share = () => {
    if (!url) return;
    void Share.share({ message: url, url });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* style chứ không className: nền đen phải chắc chắn phủ kín (thấy màn sau lộ ra khi dùng className) */}
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <FlatList
          data={items}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(it) => it.key ?? it.message_id}
          showsHorizontalScrollIndicator={false}
          windowSize={3}
          onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item: it }) => {
            const full = resolveMediaUrl(it.url, token);
            const thumb = thumbMediaUrl(it.thumbnail_url || (it.kind === 'image' ? it.url : null), token, Math.round(width));
            if (it.kind === 'video') {
              return (
                <Pressable onPress={() => full && setVideo(full)} style={{ width, height }} className="items-center justify-center">
                  {thumb ? (
                    <Image
                      source={{ uri: thumb, cacheKey: thumbCacheKey(it.thumbnail_url, width) }}
                      style={{ position: 'absolute', width, height }}
                      contentFit="contain"
                    />
                  ) : null}
                  <View className="h-16 w-16 items-center justify-center rounded-full bg-black/55">
                    <Ionicons name="play" size={30} color="#fff" style={{ marginLeft: 4 }} />
                  </View>
                </Pressable>
              );
            }
            return full ? (
              <View style={{ width, height }}>
                <ZoomableImage uri={full} onDismiss={onClose} pager onZoomChange={setZoomed} />
              </View>
            ) : (
              <View style={{ width, height }} />
            );
          }}
        />

        {/* Thanh trên */}
        <View className="absolute left-0 right-0 flex-row items-center gap-3 px-3" style={{ top: insets.top + 6 }} pointerEvents="box-none">
          <Pressable onPress={onClose} accessibilityLabel="Đóng" className="h-10 w-10 items-center justify-center rounded-full bg-white/15">
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-white" numberOfLines={1}>
              {item?.sender.full_name}
            </Text>
            {item ? <Text className="text-[12px] text-white/70">{formatDateTime(item.created_at)}</Text> : null}
          </View>
          <Text className="text-[13px] font-semibold text-white/80">
            {current + 1}/{items.length}
          </Text>
        </View>

        {/* Thanh dưới */}
        <View className="absolute left-0 right-0 flex-row justify-center gap-3 px-4" style={{ bottom: insets.bottom + 16 }}>
          <GalleryButton icon="share-outline" label="Chia sẻ" onPress={share} />
          <GalleryButton
            icon="chatbubble-ellipses-outline"
            label="Xem trong đoạn chat"
            onPress={() => {
              if (!item) return;
              onClose();
              onGoToMessage(item.message_id);
            }}
          />
        </View>
      </GestureHandlerRootView>
      {video ? <VideoPlayerModal uri={video} onClose={() => setVideo(null)} /> : null}
    </Modal>
  );
}

function GalleryButton({
  icon,
  label,
  onPress,
}: {
  icon: 'share-outline' | 'chatbubble-ellipses-outline';
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="h-11 flex-row items-center gap-2 rounded-full bg-white/15 px-4 active:opacity-70">
      <Ionicons name={icon} size={18} color="#fff" />
      <Text className="text-[14px] font-semibold text-white">{label}</Text>
    </Pressable>
  );
}
