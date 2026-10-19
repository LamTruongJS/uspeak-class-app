import { Ionicons } from '@expo/vector-icons';
import { FlashList, type FlashListRef, type ListRenderItem } from '@shopify/flash-list';
import { router } from 'expo-router';
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, type SheetOptions } from '@/components/ui/action-sheet';
import { Avatar } from '@/components/ui/avatar';
import { MenuButton } from '@/features/navigation/app-menu';
import { useTabBarSpace } from '@/components/ui/floating-tab-bar';
import { showToast } from '@/components/ui/toast';
import { StateView } from '@/components/ui/state-view';
import { chatApi, patchRoom, useChatRooms } from '@/features/chat/api';
import { plainContent, roomTime, roomTitle } from '@/features/chat/format';
import { fold } from '@/features/chat/mentions';
import { CLASS_ROOM_TYPES, RoomAvatar } from '@/features/chat/room-avatar';
import type { ChatRoomItem } from '@/features/chat/types';
import { getErrorMessage } from '@/lib/api/client';
import { mediaCacheKey, resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';
import { AppIcon } from '@/components/ui/app-icon';

type Filter = 'all' | 'unread' | 'class' | 'group' | 'direct';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'unread', label: 'Chưa đọc' },
  { key: 'class', label: 'Lớp học' },
  { key: 'group', label: 'Nhóm' },
  { key: 'direct', label: 'Cá nhân' },
];

function matchFilter(r: ChatRoomItem, f: Filter) {
  switch (f) {
    case 'unread':
      return (r.unread_count ?? 0) > 0 || !!r.has_unread_mention;
    case 'class':
      return CLASS_ROOM_TYPES.has(r.type);
    case 'group':
      return r.type === 'group' || r.type === 'custom' || r.type === 'group_support';
    case 'direct':
      return r.type === 'direct';
    default:
      return true;
  }
}

const ROW_HEIGHT = 76;

interface RowColors {
  muted: string;
  brand: string;
  onBrand: string;
  success: string;
}

/**
 * Danh sách cuộc trò chuyện.
 *
 * Hiệu năng (tài khoản quản trị ở hàng trăm phòng, tin đến liên tục):
 * - FlashList (tái sử dụng ô) thay FlatList.
 * - Mỗi dòng là memo và KHÔNG tự gọi hook (theme, store, media token) — cha truyền xuống, nên
 *   tin mới ở 1 phòng chỉ vẽ lại đúng dòng đó (socket patchRoom giữ nguyên object các phòng khác).
 * - Bỏ dấu tên phòng tính sẵn 1 lần mỗi khi danh sách đổi; ô tìm dùng useDeferredValue để gõ không khựng.
 */
export default function ChatRoomsScreen() {
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const { data, isLoading, isError, error, refetch } = useChatRooms();
  const pull = usePullRefresh(refetch);
  const myId = useAuthStore((s) => s.user?._id);
  const { data: token } = useMediaToken();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const foreground = useThemeColor('foreground');
  const onBrand = useThemeColor('on-brand');
  const success = useThemeColor('success');
  const colors = useMemo<RowColors>(() => ({ muted, brand, onBrand, success }), [muted, brand, onBrand, success]);

  const [search, setSearch] = useState('');
  const query = useDeferredValue(fold(search.trim()));
  const [filter, setFilter] = useState<Filter>('all');
  const listRef = useRef<FlashListRef<ChatRoomItem>>(null);

  // Đổi bộ lọc / từ khoá → về đầu danh sách (không thì đứng lơ lửng giữa danh sách mới)
  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [filter, query]);

  // Sắp xếp + chuỗi tìm kiếm (đã bỏ dấu) — chỉ tính lại khi danh sách phòng đổi
  const indexed = useMemo(
    () =>
      [...(data ?? [])]
        .sort((a, b) => {
          if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1;
          return (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '');
        })
        .map((r) => ({ room: r, haystack: fold(`${roomTitle(r)} ${r.class_code ?? ''}`) })),
    [data],
  );

  const rooms = useMemo(() => {
    // Tìm theo TỪNG TỪ: "at03 nhom 3" khớp "AT03 - Nhóm 3" (so cả cụm thì vướng dấu " - " ở giữa)
    const words = query.split(/\s+/).filter(Boolean);
    return indexed.filter((x) => matchFilter(x.room, filter) && words.every((w) => x.haystack.includes(w))).map((x) => x.room);
  }, [indexed, filter, query]);
  // Số phòng chưa đọc trong TỪNG bộ lọc — chip "Lớp học 2" cho biết có tin mới ở đâu mà không phải bấm thử
  const unreadBy = useMemo(() => {
    const out: Record<Filter, number> = { all: 0, unread: 0, class: 0, group: 0, direct: 0 };
    for (const { room } of indexed) {
      if (!matchFilter(room, 'unread') || room.notifications_muted) continue;
      (Object.keys(out) as Filter[]).forEach((k) => {
        if (k !== 'all' && matchFilter(room, k)) out[k] += 1;
      });
    }
    return out;
  }, [indexed]);
  // "Đang hoạt động": người nhắn riêng với mình đang online (hàng avatar kiểu Messenger)
  const online = useMemo(
    () =>
      indexed
        .map((x) => x.room)
        .filter((r) => r.type === 'direct' && r.direct_recipient && !r.direct_recipient.is_multi && r.direct_recipient.is_online)
        .slice(0, 15),
    [indexed],
  );
  const searching = query.length > 0;
  const words = useMemo(() => query.split(/\s+/).filter(Boolean), [query]);

  // Nhấn giữ 1 phòng → menu trượt từ dưới (setState ổn định nên không làm các dòng memo vẽ lại)
  const [menuRoomId, setMenuRoomId] = useState<string | null>(null);
  const onLongPress = useCallback((room: ChatRoomItem) => setMenuRoomId(room._id), []);
  const menuRoom = menuRoomId ? ((data ?? []).find((r) => r._id === menuRoomId) ?? null) : null;

  const renderItem = useCallback<ListRenderItem<ChatRoomItem>>(
    ({ item }) => (
      <RoomRow room={item} myId={myId} token={token?.media_token} colors={colors} onLongPress={onLongPress} highlight={words} />
    ),
    [myId, token?.media_token, colors, onLongPress, words],
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top + 8 }}>
      {/* ── Đầu trang: tiêu đề + soạn tin, ô tìm, bộ lọc — cố định, không cuộn theo danh sách ── */}
      <View className="px-4">
        <View className="flex-row items-center gap-3 pb-2.5">
          <MenuButton />
          <Text className="flex-1 text-[28px] font-extrabold tracking-tight text-foreground" numberOfLines={1}>
            Đoạn chat
          </Text>
          <Pressable
            onPress={() => router.push('/chat/new')}
            hitSlop={8}
            accessibilityLabel="Nhắn tin mới"
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-muted active:opacity-70">
            <Ionicons name="create-outline" size={21} color={foreground} />
          </Pressable>
        </View>
        <View className="h-11 flex-row items-center gap-2 rounded-full bg-surface-muted px-4">
          <Ionicons name="search" size={18} color={muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Tìm lớp, nhóm, người…"
            placeholderTextColor={muted}
            className="flex-1 text-[15px] text-foreground"
            autoCorrect={false}
            returnKeyType="search"
          />
          {search ? (
            <Pressable hitSlop={8} onPress={() => setSearch('')} accessibilityLabel="Xoá ô tìm">
              <Ionicons name="close-circle" size={18} color={muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {searching ? (
        <Text className="px-5 pb-1 pt-3 text-[13px] font-semibold text-muted">{rooms.length ? `${rooms.length} cuộc trò chuyện` : ''}</Text>
      ) : (
        // Xuống dòng chứ không cuộn ngang: cuộn ngang thì chip cuối luôn bị cắt dở ở mép phải,
        // người dùng không biết còn mục nào phía sau (cùng cách làm với màn Lớp học).
        <View className="flex-row flex-wrap gap-1.5 px-4 pb-2.5 pt-3">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            const count = unreadBy[f.key];
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                className={`h-8 flex-row items-center gap-1.5 rounded-full px-3 active:opacity-80 ${on ? 'bg-brand' : 'bg-surface-muted'}`}>
                <Text className={`text-[13.5px] font-semibold ${on ? 'text-on-brand' : 'text-muted'}`}>{f.label}</Text>
                {count > 0 ? (
                  <View
                    className={`h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 ${on ? 'bg-on-brand' : 'bg-brand-soft'}`}>
                    <Text className={`text-[10px] font-bold ${on ? 'text-brand' : 'text-brand'}`}>{count > 99 ? '99+' : count}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {isLoading ? (
        <SkeletonList />
      ) : isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được tin nhắn"
          description={getErrorMessage(error)}
          actionLabel="Thử lại"
          onAction={() => refetch()}
        />
      ) : (
        <FlashList
          // Đổi bộ lọc = dựng lại danh sách (key). Thiếu nó thì danh sách giữ nguyên vị trí cuộn cũ
          // và dòng đầu không được vẽ lại — còn một khoảng trống mà bấm vào vẫn mở đúng phòng.
          // `scrollToOffset(0)` không cứu được vì chạy trước lúc danh sách đo lại.
          key={filter}
          ref={listRef}
          data={rooms}
          // Giữ nguyên dòng đang nhìn khi có tin mới chen lên đầu, nhưng đang ở gần đầu danh sách thì
          // tự cuộn lên để thấy phòng vừa có tin. TẮT HẲN (`disabled: true`) thì thỉnh thoảng dòng đầu
          // không được vẽ lại sau khi đổi lọc / đổi giao diện — còn chỗ trống bấm vào vẫn mở đúng phòng.
          maintainVisibleContentPosition={{ autoscrollToTopThreshold: 120 }}
          keyExtractor={(r) => r._id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshing={pull.refreshing}
          onRefresh={pull.onRefresh}
          contentContainerStyle={{ paddingBottom: tabBarSpace }}
          ListHeaderComponent={
            !searching && filter === 'all' && online.length ? <OnlineStrip rooms={online} token={token?.media_token} /> : null
          }
          ListEmptyComponent={
            <StateView
              icon={search || filter !== 'all' ? 'search-outline' : 'chatbubbles-outline'}
              title={
                search
                  ? 'Không tìm thấy cuộc trò chuyện'
                  : filter === 'unread'
                    ? 'Bạn đã đọc hết tin nhắn 🎉'
                    : 'Chưa có cuộc trò chuyện nào'
              }
            />
          }
        />
      )}
      <RoomActionSheet room={menuRoom} onClose={() => setMenuRoomId(null)} />
    </View>
  );
}

/**
 * Menu nhấn giữ một phòng — dùng thẳng `ActionSheet` chung của app (không tự vẽ modal nữa)
 * để trông giống mọi bảng chọn khác: cùng bo góc, cùng nút Huỷ, cùng kiểu đóng rồi mới chạy.
 */
function RoomActionSheet({ room, onClose }: { room: ChatRoomItem | null; onClose: () => void }) {
  const muted = !!room?.notifications_muted;

  async function toggleMute(id: string) {
    patchRoom(id, (r) => ({ ...r, notifications_muted: !muted }));
    try {
      await chatApi.setNotificationsMuted(id, !muted);
      showToast(muted ? 'success' : 'info', muted ? 'Đã bật thông báo' : 'Đã tắt thông báo');
    } catch (err) {
      patchRoom(id, (r) => ({ ...r, notifications_muted: muted }));
      showToast('error', 'Chưa lưu được', getErrorMessage(err));
    }
  }

  const options: SheetOptions | null = room
    ? {
        title: roomTitle(room),
        actions: [
          {
            icon: 'chatbubble-outline',
            label: 'Mở cuộc trò chuyện',
            onPress: () => router.push({ pathname: '/chat/[roomId]', params: { roomId: room._id } }),
          },
          {
            icon: muted ? 'notifications-outline' : 'notifications-off-outline',
            label: muted ? 'Bật thông báo' : 'Tắt thông báo',
            onPress: () => void toggleMute(room._id),
          },
          {
            icon: 'information-circle-outline',
            label: 'Thông tin phòng',
            onPress: () => router.push({ pathname: '/chat/info/[roomId]', params: { roomId: room._id } }),
          },
        ],
      }
    : null;

  return <ActionSheet options={options} onClose={onClose} />;
}

const RoomRow = memo(function RoomRow({
  room,
  myId,
  token,
  colors,
  onLongPress,
  highlight,
}: {
  room: ChatRoomItem;
  myId?: string;
  token?: string;
  colors: RowColors;
  onLongPress: (room: ChatRoomItem) => void;
  /** Từ khoá đang tìm (đã bỏ dấu) — tô đậm phần khớp trong tên phòng */
  highlight: string[];
}) {
  const unread = room.unread_count ?? 0;
  const last = room.last_message;
  const isDirect = room.type === 'direct';
  const prefix = last
    ? last.sender_id === myId
      ? 'Bạn: '
      : last.sender_name && !isDirect
        ? `${last.sender_name.split(' ').pop()}: `
        : ''
    : '';
  const preview = last
    ? prefix + plainContent(last.content).replace(/\s+/g, ' ')
    : room.class_code
      ? `Lớp ${room.class_code}`
      : 'Chưa có tin nhắn';
  const bold = unread > 0;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/chat/[roomId]', params: { roomId: room._id } })}
      onLongPress={() => onLongPress(room)}
      delayLongPress={350}
      android_ripple={{ color: 'rgba(127,127,127,0.12)' }}
      style={({ pressed }) => ({ height: ROW_HEIGHT, opacity: pressed ? 0.85 : 1 })}
      className="flex-row items-center gap-3 px-4">
      <RoomAvatar room={room} token={token} size={54} brand={colors.brand} success={colors.success} />
      {/* Gạch mảnh thụt vào qua khỏi avatar: dày đặc thế này mà không có gạch thì các dòng dính vào nhau */}
      {/* Chiều cao khai bằng SỐ, đừng dùng `h-full`: trong FlashList, chiều cao 100% có lúc tính ra 0
          (lượt đo đầu chưa biết chiều cao cha) → cả dòng tàng hình, chỉ còn khoảng trống bấm được. */}
      <View style={{ height: ROW_HEIGHT }} className="flex-1 justify-center gap-[3px] border-b border-border">
        {/* Hàng trên: tên — (tắt báo) — giờ. Giờ nằm đây chứ không chen giữa dòng xem trước
            như trước, nhờ vậy chữ xem trước được dùng trọn hàng dưới thay vì bị cắt sớm. */}
        <View className="flex-row items-center gap-1.5">
          {room.is_pinned ? <AppIcon name="pushpin" size={12} color={colors.muted} /> : null}
          <Text className={`flex-1 text-[15.5px] text-foreground ${bold ? 'font-bold' : 'font-medium'}`} numberOfLines={1}>
            <Highlighted text={roomTitle(room)} words={highlight} />
          </Text>
          {room.notifications_muted ? <Ionicons name="notifications-off" size={13} color={colors.muted} /> : null}
          {room.last_message_at ? (
            <Text className={`text-[12px] ${bold ? 'font-bold text-foreground' : 'text-muted'}`}>
              {roomTime(room.last_message_at)}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-1.5">
          {/* `shrink` + ô đệm `flex-1` chứ KHÔNG phải `flex-1` thẳng trên Text: trên Android,
              Text một dòng đặt flex-1 vẫn chiếm đúng bề rộng chữ gốc, đẩy huy hiệu ra khỏi mép. */}
          <Text className={`shrink text-[13.5px] ${bold ? 'font-semibold text-foreground' : 'text-muted'}`} numberOfLines={1}>
            {preview}
          </Text>
          <View className="flex-1" />
          {room.has_unread_mention ? (
            <View className="h-[19px] w-[19px] items-center justify-center rounded-full bg-brand">
              <Text className="text-[11px] font-bold text-on-brand">@</Text>
            </View>
          ) : null}
          {unread ? (
            // Phòng tắt thông báo: viên xám nhạt có viền, số màu xám đậm. Trước là chữ TRẮNG trên
            // nền xám — đúng ý "làm mờ đi" nhưng tương phản yếu ở cả sáng lẫn tối, số bị nhoè.
            <View
              className={`h-[19px] min-w-[19px] items-center justify-center rounded-full px-1.5 ${
                room.notifications_muted ? 'border border-border bg-surface-muted' : 'bg-brand'
              }`}>
              <Text className={`text-[10.5px] font-bold ${room.notifications_muted ? 'text-muted' : 'text-on-brand'}`}>
                {unread > 99 ? '99+' : unread}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

/** Khung xương lúc tải lần đầu — đỡ trống trơn + đỡ "nhảy" khi dữ liệu về. */
function SkeletonList() {
  return (
    <View>
      {Array.from({ length: 8 }, (_, i) => (
        <View key={i} className="flex-row items-center gap-3 px-4" style={{ height: ROW_HEIGHT }}>
          <View className="h-[54px] w-[54px] rounded-full bg-surface-muted" />
          <View className="flex-1 gap-2">
            <View className="h-3.5 w-1/2 rounded bg-surface-muted" />
            <View className="h-3 w-4/5 rounded bg-surface-muted" />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Tô đậm phần khớp từ khoá. So khớp trên bản bỏ dấu (gõ "nhom" vẫn tô "Nhóm"); bỏ dấu TỪNG KÝ TỰ
 * nên vị trí trong chuỗi gốc và chuỗi bỏ dấu khớp 1-1.
 */
function Highlighted({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const folded = [...text].map((ch) => fold(ch).charAt(0) || ch).join('');
  const mark = new Array<boolean>(text.length).fill(false);
  for (const w of words) {
    let i = folded.indexOf(w);
    while (i >= 0) {
      for (let k = i; k < i + w.length; k++) mark[k] = true;
      i = folded.indexOf(w, i + w.length);
    }
  }
  const parts: { t: string; on: boolean }[] = [];
  [...text].forEach((ch, i) => {
    const last = parts[parts.length - 1];
    if (last && last.on === mark[i]) last.t += ch;
    else parts.push({ t: ch, on: mark[i] });
  });
  return (
    <>
      {parts.map((p, i) =>
        p.on ? (
          <Text key={i} className="font-extrabold text-brand">
            {p.t}
          </Text>
        ) : (
          p.t
        ),
      )}
    </>
  );
}

/** Hàng avatar "Đang hoạt động" (người nhắn riêng đang online) — bấm là vào thẳng cuộc trò chuyện. */
function OnlineStrip({ rooms, token }: { rooms: ChatRoomItem[]; token?: string }) {
  const success = useThemeColor('success');
  return (
    <View className="mb-1 border-b border-border pb-1">
      <Text className="px-4 pb-1.5 text-[12.5px] font-semibold uppercase tracking-wide text-muted">Đang hoạt động</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3 px-4 pb-2">
      {rooms.map((r) => {
        const p = r.direct_recipient!;
        return (
          <Pressable
            key={r._id}
            onPress={() => router.push({ pathname: '/chat/[roomId]', params: { roomId: r._id } })}
            className="w-[64px] items-center gap-1 active:opacity-70">
            <View>
              <Avatar name={p.full_name} uri={resolveMediaUrl(p.avatar_url, token)} cacheKey={mediaCacheKey(p.avatar_url)} size={56} />
              <View
                className="absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full border-[3px] border-background"
                style={{ backgroundColor: success }}
              />
            </View>
            <Text className="text-center text-[12px] text-foreground" numberOfLines={2}>
              {p.full_name.split(' ').slice(-2).join(' ')}
            </Text>
          </Pressable>
        );
      })}
      </ScrollView>
    </View>
  );
}
