import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { RichText } from '@/components/ui/rich-text';
import { ImageViewer } from '@/features/chat/message-content';
import { formatDateTime } from '@/lib/format';
import { useThemeColor } from '@/theme/use-theme-color';

import {
  notificationStatus,
  notificationTitle,
  useMarkClassNotificationRead,
  type ClassNotification,
  type ClassNotificationAttachment,
} from './api';

const isImage = (a: ClassNotificationAttachment) => a.type?.startsWith('image') || /\.(png|jpe?g|gif|webp|heic)$/i.test(a.name || '');

const formatSize = (bytes: number) => {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

/**
 * Mở/đóng thông báo + tự đánh dấu đã xem sau 0,8s giống web (mở nhanh rồi đóng thì không tính là
 * đã đọc). Trả về state cho màn hình nào cũng dùng được — học viên (`canManage = false`) mới gọi
 * mark-read, nhân viên chỉ xem.
 */
export function useNotificationReader(classId: string, items: ClassNotification[], canManage = false) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const markRead = useMarkClassNotificationRead(classId);
  const opened = items.find((n) => n._id === expandedId);
  const shouldMark = !canManage && !!opened && !opened.is_read;

  useEffect(() => {
    if (!shouldMark || !expandedId) return;
    const timer = setTimeout(() => markRead.mutate(expandedId), 800);
    return () => clearTimeout(timer);
    // markRead đổi object mỗi render → chỉ phụ thuộc id + cờ cần đánh dấu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId, shouldMark]);

  return {
    expandedId,
    toggle: (id: string) => setExpandedId((current) => (current === id ? null : id)),
  };
}

export const NotificationCard = memo(function NotificationCard({
  item,
  now,
  expanded,
  canManage,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ClassNotification;
  now: number;
  expanded: boolean;
  canManage?: boolean;
  onToggle: () => void;
  /** Nhân sự: nút Sửa / Xoá hiện khi mở thông báo */
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const [viewer, setViewer] = useState<string | null>(null);
  const status = notificationStatus(item, now);
  const unread = !canManage && !item.is_read;
  const images = (item.attachments ?? []).filter(isImage);
  const files = (item.attachments ?? []).filter((a) => !isImage(a));

  return (
    <View className={`overflow-hidden rounded-3xl border bg-surface ${unread ? 'border-info' : 'border-transparent'}`}>
      <Pressable onPress={onToggle} className="gap-2 p-3.5 active:bg-surface-muted">
        <View className="flex-row items-center gap-2">
          <Badge label={status.label} tone={status.tone} />
          {unread ? <Badge label="Chưa xem" tone="info" dot /> : null}
          <View className="flex-1" />
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={muted} />
        </View>

        <Text className="text-[15px] font-bold leading-5 text-foreground" numberOfLines={expanded ? undefined : 2}>
          {notificationTitle(item)}
        </Text>

        {expanded ? (
          <View className="gap-2.5 pt-0.5">
            <RichText html={item.content} className="text-[15px] text-foreground" />

            {images.length ? (
              <View className="flex-row flex-wrap gap-2">
                {images.map((a) => (
                  <Pressable key={a.key} onPress={() => a.url && setViewer(a.url)} className="active:opacity-80">
                    <Image
                      source={{ uri: a.url, cacheKey: a.key }}
                      style={{ width: 104, height: 104, borderRadius: 12 }}
                      contentFit="cover"
                      transition={120}
                    />
                  </Pressable>
                ))}
              </View>
            ) : null}

            {files.map((a) => (
              <Pressable
                key={a.key}
                onPress={() => a.url && Linking.openURL(a.url)}
                className="flex-row items-center gap-2.5 rounded-xl bg-surface-muted p-2.5 active:opacity-70">
                <Ionicons name="document-attach-outline" size={20} color={brand} />
                <View className="flex-1">
                  <Text className="text-[13px] font-semibold text-foreground" numberOfLines={1}>
                    {a.name}
                  </Text>
                  {formatSize(a.size) ? <Text className="text-[11px] text-muted">{formatSize(a.size)}</Text> : null}
                </View>
                <Ionicons name="download-outline" size={16} color={muted} />
              </Pressable>
            ))}

            {onEdit || onDelete ? (
              <View className="flex-row gap-2 pt-0.5">
                {onEdit ? (
                  <Pressable onPress={onEdit} className="h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-surface-muted active:opacity-70">
                    <Ionicons name="create-outline" size={16} color={brand} />
                    <Text className="text-[13.5px] font-bold text-brand">Sửa</Text>
                  </Pressable>
                ) : null}
                {onDelete ? (
                  <Pressable onPress={onDelete} className="h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-danger-soft active:opacity-70">
                    <Ionicons name="trash-outline" size={16} color="#dc2626" />
                    <Text className="text-[13.5px] font-bold text-danger">Xoá</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {item.video_url ? (
              <Pressable
                onPress={() => Linking.openURL(item.video_url!)}
                className="flex-row items-center gap-2.5 rounded-xl bg-surface-muted p-2.5 active:opacity-70">
                <Ionicons name="logo-youtube" size={20} color="#ef4444" />
                <Text className="flex-1 text-[13px] font-semibold text-foreground" numberOfLines={1}>
                  Xem video kèm theo
                </Text>
                <Ionicons name="open-outline" size={16} color={muted} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <RichText html={item.content} className="text-[13px] text-muted" numberOfLines={2} />
        )}

        <View className="flex-row items-center gap-1.5 pt-0.5">
          <Ionicons name="time-outline" size={13} color={muted} />
          <Text className="text-[11px] text-muted">
            {formatDateTime(item.visible_from)}
            {item.visible_until ? ` → ${formatDateTime(item.visible_until)}` : ''}
          </Text>
          {!expanded && (item.attachments?.length || item.video_url) ? (
            <>
              <Ionicons name="attach" size={13} color={muted} />
              <Text className="text-[11px] text-muted">{(item.attachments?.length ?? 0) + (item.video_url ? 1 : 0)}</Text>
            </>
          ) : null}
        </View>
      </Pressable>

      <ImageViewer uri={viewer} onClose={() => setViewer(null)} />
    </View>
  );
});
