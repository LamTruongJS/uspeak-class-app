import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDateTime } from '@/lib/format';
import { useThemeColor } from '@/theme/use-theme-color';

import { usePinnedMessages } from './api';
import { plainContent } from './format';
import type { ChatMessage } from './types';

function preview(m: ChatMessage) {
  if (m.assignment_card) return `📄 ${m.assignment_card.title}`;
  if (m.message_type === 'image') return '[Hình ảnh]';
  if (m.message_type === 'voice') return '[Tin nhắn thoại]';
  if (m.message_type === 'video') return '[Video]';
  if (m.message_type === 'file') return `[Tệp] ${m.file_name ?? ''}`;
  return plainContent(m.content);
}

/**
 * Thanh tin ghim dưới header (như Zalo/Telegram): hiện tin ghim mới nhất, bấm để nhảy tới.
 * Có nhiều tin ghim → nút danh sách mở bảng chọn.
 */
export function PinnedBar({ roomId, onJump }: { roomId: string; onJump: (messageId: string) => void }) {
  const { data } = usePinnedMessages(roomId);
  const [listOpen, setListOpen] = useState(false);
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const insets = useSafeAreaInsets();
  if (!data?.length) return null;
  const top = data[0];

  return (
    <>
      <View className="flex-row items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <Ionicons name="pin" size={16} color={brand} />
        <Pressable className="flex-1 active:opacity-70" onPress={() => onJump(top._id)}>
          <Text className="text-xs font-semibold text-brand">Tin đã ghim{data.length > 1 ? ` (${data.length})` : ''}</Text>
          <Text className="text-sm text-foreground" numberOfLines={1}>
            {preview(top)}
          </Text>
        </Pressable>
        {data.length > 1 ? (
          <Pressable hitSlop={8} onPress={() => setListOpen(true)} accessibilityLabel="Xem tất cả tin ghim">
            <Ionicons name="list" size={20} color={muted} />
          </Pressable>
        ) : null}
      </View>

      <Modal visible={listOpen} transparent animationType="slide" onRequestClose={() => setListOpen(false)}>
        <Pressable className="flex-1 bg-black/40" onPress={() => setListOpen(false)} />
        <View className="max-h-[70%] rounded-t-3xl bg-surface pt-4" style={{ paddingBottom: insets.bottom + 8 }}>
          <Text className="px-4 pb-2 text-lg font-semibold text-foreground">Tin đã ghim</Text>
          <FlatList
            data={data}
            keyExtractor={(m) => m._id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  setListOpen(false);
                  onJump(item._id);
                }}
                className="gap-0.5 border-t border-border px-4 py-3 active:bg-surface-muted">
                <Text className="text-xs text-muted">
                  {item.sender?.full_name ?? ''} · {formatDateTime(item.created_at)}
                </Text>
                <Text className="text-base text-foreground" numberOfLines={2}>
                  {preview(item)}
                </Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}
