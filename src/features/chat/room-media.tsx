import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Linking, Pressable, Text, View } from 'react-native';

import { resolveMediaUrl, thumbCacheKey, thumbMediaUrl } from '@/lib/media';
import { useThemeColor } from '@/theme/use-theme-color';

import { useLinkPreview, type RoomMediaItem } from './api';

/** "3:51" */
export function formatDuration(sec?: number | null) {
  if (!sec) return '';
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
}

export function formatSize(bytes?: number | null) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const FILE_ICONS: { test: RegExp; icon: 'document-text' | 'document' | 'grid' | 'easel' | 'archive' | 'musical-notes'; color: string }[] = [
  { test: /pdf/i, icon: 'document-text', color: '#dc2626' },
  { test: /word|docx?$/i, icon: 'document', color: '#2563eb' },
  { test: /sheet|excel|xlsx?$|csv/i, icon: 'grid', color: '#059669' },
  { test: /presentation|powerpoint|pptx?$/i, icon: 'easel', color: '#ea580c' },
  { test: /zip|rar|7z|compressed/i, icon: 'archive', color: '#7c3aed' },
  { test: /audio|mp3|m4a|wav/i, icon: 'musical-notes', color: '#db2777' },
];

/** Icon + màu theo loại tệp (đoán theo mime, không có thì theo đuôi tên). */
export function fileIcon(item: Pick<RoomMediaItem, 'mime_type' | 'file_name'>) {
  const hay = `${item.mime_type ?? ''} ${item.file_name ?? ''}`;
  return FILE_ICONS.find((f) => f.test.test(hay)) ?? { icon: 'document' as const, color: '#6b7280' };
}

/** Ô ảnh/video vuông trong lưới (video có nút play + thời lượng). */
export function MediaTile({
  item,
  size,
  token,
  onPress,
  onLongPress,
}: {
  item: RoomMediaItem;
  size: number;
  token?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const thumb = thumbMediaUrl(item.thumbnail_url || (item.kind === 'image' ? item.url : null), token, Math.round(size * 2));
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      className="overflow-hidden bg-surface-muted active:opacity-80"
      style={{ width: size, height: size }}>
      {thumb ? (
        <Image
          source={{ uri: thumb, cacheKey: thumbCacheKey(item.thumbnail_url || item.url, size * 2) }}
          recyclingKey={item.key ?? item.message_id}
          style={{ width: size, height: size }}
          contentFit="cover"
          transition={100}
        />
      ) : (
        <View className="flex-1 items-center justify-center bg-black">
          <Ionicons name="videocam" size={size / 4} color="#ffffff99" />
        </View>
      )}
      {item.kind === 'video' ? (
        <View className="absolute inset-0 items-center justify-center">
          <View className="h-8 w-8 items-center justify-center rounded-full bg-black/55">
            <Ionicons name="play" size={15} color="#fff" style={{ marginLeft: 2 }} />
          </View>
          {item.duration ? (
            <Text
              className="absolute bottom-1 right-1.5 text-[10px] font-semibold text-white"
              style={{ textShadowColor: '#000', textShadowRadius: 3 }}>
              {formatDuration(item.duration)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/** Nút "⋯" cuối dòng tệp / link */
function MoreButton({ onPress }: { onPress: () => void }) {
  const muted = useThemeColor('muted');
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel="Tuỳ chọn"
      className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-muted">
      <Ionicons name="ellipsis-horizontal" size={18} color={muted} />
    </Pressable>
  );
}

/** Dòng tệp: icon theo loại (có đuôi tệp), tên, dung lượng · người gửi · ngày. Bấm mở tệp. */
export function FileRow({
  item,
  token,
  meta,
  onLongPress,
  onMore,
}: {
  item: RoomMediaItem;
  token?: string;
  meta: string;
  onLongPress?: () => void;
  onMore?: () => void;
}) {
  const { icon, color } = fileIcon(item);
  const url = resolveMediaUrl(item.url, token);
  const ext = (item.file_name?.split('.').pop() ?? '').slice(0, 4).toUpperCase();
  return (
    <Pressable
      onPress={() => url && Linking.openURL(url)}
      onLongPress={onLongPress}
      delayLongPress={350}
      className="flex-row items-center gap-3 py-3 pl-4 pr-2 active:bg-surface-muted">
      <View className="h-11 w-11 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}1f` }}>
        <Ionicons name={icon} size={20} color={color} />
        {ext ? (
          <Text className="text-[8.5px] font-extrabold" style={{ color }}>
            {ext}
          </Text>
        ) : null}
      </View>
      <View className="flex-1">
        <Text className="text-[14.5px] font-medium text-foreground" numberOfLines={2}>
          {item.file_name}
        </Text>
        <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
          {[formatSize(item.file_size), meta].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {onMore ? <MoreButton onPress={onMore} /> : null}
    </Pressable>
  );
}

/**
 * Dòng link: ảnh xem trước (og:image) hoặc icon, tiêu đề trang (nếu lấy được) + tên miền, người gửi · ngày.
 * Xem trước lấy qua /chat/link-preview (cache 1 ngày) — trang chặn bot (Zoom…) thì chỉ hiện tên miền.
 */
export function LinkRow({
  item,
  meta,
  brand,
  onLongPress,
  onMore,
}: {
  item: RoomMediaItem;
  meta: string;
  brand: string;
  onLongPress?: () => void;
  onMore?: () => void;
}) {
  const url = item.url ?? '';
  const preview = useLinkPreview(url || null);
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    // giữ nguyên chuỗi
  }
  const title = preview.data?.title?.trim();
  const image = preview.data?.image;
  return (
    <Pressable
      onPress={() => url && Linking.openURL(url)}
      onLongPress={onLongPress}
      delayLongPress={350}
      className="flex-row items-center gap-3 py-3 pl-4 pr-2 active:bg-surface-muted">
      {image ? (
        <Image source={{ uri: image }} style={{ width: 44, height: 44, borderRadius: 12 }} contentFit="cover" />
      ) : (
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-brand-soft">
          <Ionicons name="link" size={21} color={brand} />
        </View>
      )}
      <View className="flex-1">
        <Text className="text-[14.5px] font-semibold text-foreground" numberOfLines={title ? 2 : 1}>
          {title || host}
        </Text>
        <Text className="text-xs text-info" numberOfLines={1}>
          {title ? host : url}
        </Text>
        <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {onMore ? <MoreButton onPress={onMore} /> : null}
    </Pressable>
  );
}
