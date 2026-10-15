import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { useThemeColor } from '@/theme/use-theme-color';

import { useChatRooms } from './api';
import { plainContent, roomTitle } from './format';
import { fold } from './mentions';
import { emitWithAck } from './socket';
import type { ChatMessage } from './types';

/** Chuyển tiếp 1 tin sang nhiều phòng (socket forward_message — mỗi phòng xử lý độc lập). */
export function ForwardSheet({ message, onClose }: { message: ChatMessage | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const rooms = useChatRooms();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  const list = useMemo(() => {
    const q = fold(search.trim());
    return (rooms.data ?? [])
      .filter((r) => r._id !== message?.room_id && !r.my_is_muted)
      .filter((r) => !q || fold(roomTitle(r)).includes(q));
  }, [rooms.data, search, message?.room_id]);

  const close = () => {
    setSelected([]);
    setSearch('');
    onClose();
  };

  async function send() {
    if (!message || !selected.length) return;
    setSending(true);
    const res = await emitWithAck<{ room_id: string; success: boolean; error?: string }[]>('forward_message', {
      source_message_id: message._id,
      target_room_ids: selected,
    });
    setSending(false);
    // 1 phòng: server trả kiểu cũ ({ success, data: messages }); nhiều phòng: data là kết quả từng phòng.
    const failed = selected.length > 1 && Array.isArray(res.data) ? res.data.filter((r) => !r.success) : [];
    if (!res.success || failed.length) {
      showToast('error', 'Chưa chuyển tiếp hết', res.error || `${failed.length} phòng chưa gửi được: ${failed[0]?.error ?? ''}`);
    }
    close();
  }

  return (
    <Modal visible={!!message} animationType="slide" onRequestClose={close} presentationStyle="pageSheet">
      <View className="flex-1 bg-background" style={{ paddingBottom: insets.bottom }}>
        <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <Pressable onPress={close} hitSlop={8}>
            <Text className="text-base text-brand">Huỷ</Text>
          </Pressable>
          <Text className="text-base font-semibold text-foreground">Chuyển tiếp</Text>
          <View style={{ width: 32 }} />
        </View>
        {message ? (
          <View className="m-4 rounded-xl bg-surface-muted p-3">
            <Text className="text-sm text-foreground" numberOfLines={3}>
              {message.message_type === 'image' ? '[Hình ảnh]' : plainContent(message.content)}
            </Text>
          </View>
        ) : null}
        <View className="mx-4 mb-2 h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
          <Ionicons name="search" size={18} color={muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Tìm phòng…"
            placeholderTextColor={muted}
            className="flex-1 text-base text-foreground"
          />
        </View>
        <FlatList
          data={list}
          keyExtractor={(r) => r._id}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-4"
          renderItem={({ item }) => {
            const on = selected.includes(item._id);
            return (
              <Pressable
                onPress={() => setSelected((s) => (on ? s.filter((x) => x !== item._id) : [...s, item._id]))}
                className="flex-row items-center gap-3 py-3 active:opacity-70">
                <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? brand : muted} />
                <Text className="flex-1 text-base text-foreground" numberOfLines={1}>
                  {roomTitle(item)}
                </Text>
              </Pressable>
            );
          }}
        />
        <View className="px-4 pt-2">
          <Button
            title={selected.length ? `Gửi tới ${selected.length} phòng` : 'Chọn phòng để gửi'}
            icon="arrow-redo"
            disabled={!selected.length}
            loading={sending}
            onPress={send}
          />
        </View>
      </View>
    </Modal>
  );
}
