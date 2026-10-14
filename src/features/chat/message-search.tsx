import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { StateView } from '@/components/ui/state-view';
import { formatDateTime } from '@/lib/format';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { useThemeColor } from '@/theme/use-theme-color';

import { useMessageSearch } from './api';
import { plainContent } from './format';
import { fold } from './mentions';

/**
 * Tìm tin trong phòng — server tìm không phân biệt dấu (GET /chat/rooms/:id/messages/search, 50 tin
 * mới nhất khớp). Bấm kết quả → đóng và nhảy tới tin đó (onPick = jumpTo của phòng chat).
 */
export function MessageSearchSheet({
  roomId,
  visible,
  onClose,
  onPick,
}: {
  roomId: string;
  visible: boolean;
  onClose: () => void;
  onPick: (messageId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const { data: token } = useMediaToken();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const search = useMessageSearch(roomId, q);

  useEffect(() => {
    const t = setTimeout(() => setQ(input.trim()), 350);
    return () => clearTimeout(t);
  }, [input]);

  const close = () => {
    setInput('');
    setQ('');
    onClose();
  };

  const tooShort = q.length < 2;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View className="flex-1 bg-background" style={{ paddingBottom: insets.bottom }}>
        <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
          <View className="h-10 flex-1 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
            <Ionicons name="search" size={18} color={muted} />
            <TextInput
              value={input}
              onChangeText={setInput}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              placeholder="Tìm tin nhắn trong phòng…"
              placeholderTextColor={muted}
              className="flex-1 text-base text-foreground"
            />
            {input ? (
              <Pressable hitSlop={8} onPress={() => setInput('')} accessibilityLabel="Xoá ô tìm">
                <Ionicons name="close-circle" size={18} color={muted} />
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={close} hitSlop={8}>
            <Text className="text-base text-brand">Đóng</Text>
          </Pressable>
        </View>

        <FlatList
          data={tooShort ? [] : (search.data ?? [])}
          keyExtractor={(m) => m._id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerClassName="px-4 pb-6"
          ListHeaderComponent={
            !tooShort && search.data?.length ? (
              <Text className="pb-1 pt-3 text-xs font-semibold uppercase text-muted">
                {search.data.length >= 50 ? '50 tin gần nhất' : `${search.data.length} kết quả`}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            tooShort ? (
              <StateView icon="search-outline" title="Tìm trong cuộc trò chuyện" description="Gõ ít nhất 2 ký tự — không cần gõ dấu." />
            ) : search.isFetching ? (
              <ActivityIndicator className="py-8" />
            ) : search.isError ? (
              <StateView icon="cloud-offline-outline" title="Chưa tìm được" description="Kiểm tra kết nối rồi thử lại." actionLabel="Thử lại" onAction={() => search.refetch()} />
            ) : (
              <StateView icon="chatbubble-outline" title="Không có tin nào khớp" />
            )
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                close();
                onPick(item._id);
              }}
              className="flex-row gap-3 border-b border-border py-3 active:opacity-70">
              <Avatar name={item.sender?.full_name} uri={resolveMediaUrl(item.sender?.avatar_url, token?.media_token)} size={38} />
              <View className="flex-1 gap-0.5">
                <View className="flex-row items-center gap-2">
                  <Text className="flex-1 text-sm font-semibold text-foreground" numberOfLines={1}>
                    {item.sender?.full_name ?? 'Hệ thống'}
                  </Text>
                  <Text className="text-xs text-muted">{formatDateTime(item.created_at)}</Text>
                </View>
                <Highlighted text={plainContent(item.content)} query={q} />
              </View>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

/**
 * Tô đậm đoạn khớp. So khớp trên bản đã bỏ dấu: với chữ tiếng Việt dạng NFC mỗi ký tự bỏ dấu
 * vẫn còn đúng 1 ký tự, nên vị trí trong bản bỏ dấu = vị trí trong bản gốc.
 */
function Highlighted({ text, query }: { text: string; query: string }) {
  const source = text.normalize('NFC');
  const hay = fold(source);
  const needle = fold(query);
  const parts: { s: string; hit: boolean }[] = [];
  if (needle && hay.length === source.length) {
    let from = 0;
    let at = hay.indexOf(needle);
    while (at >= 0) {
      if (at > from) parts.push({ s: source.slice(from, at), hit: false });
      parts.push({ s: source.slice(at, at + needle.length), hit: true });
      from = at + needle.length;
      at = hay.indexOf(needle, from);
    }
    if (from < source.length) parts.push({ s: source.slice(from), hit: false });
  } else {
    parts.push({ s: source, hit: false });
  }
  // Đoạn khớp nằm xa cuối tin dài → cắt bớt phần đầu để thấy được chỗ khớp
  const firstHit = parts.findIndex((p) => p.hit);
  if (firstHit > 0 && parts[firstHit - 1].s.length > 60) {
    parts[firstHit - 1] = { s: '…' + parts[firstHit - 1].s.slice(-40), hit: false };
  }
  return (
    <Text className="text-sm text-foreground" numberOfLines={3}>
      {parts.map((p, i) =>
        p.hit ? (
          <Text key={i} className="font-bold text-brand">
            {p.s}
          </Text>
        ) : (
          p.s
        ),
      )}
    </Text>
  );
}
