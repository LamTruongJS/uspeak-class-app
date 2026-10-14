import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import * as Clipboard from 'expo-clipboard';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, Share, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StateView } from '@/components/ui/state-view';
import { useRoomMedia, type RoomMediaItem, type RoomMediaType } from '@/features/chat/api';
import { MediaGallery } from '@/features/chat/media-gallery';
import { FileRow, LinkRow, MediaTile } from '@/features/chat/room-media';
import { setRoomIntent } from '@/features/chat/room-intent';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { useThemeColor } from '@/theme/use-theme-color';

const TABS: { value: RoomMediaType; label: string }[] = [
  { value: 'media', label: 'Ảnh & video' },
  { value: 'file', label: 'Tệp' },
  { value: 'link', label: 'Link' },
];
const COLS = 3;
const GAP = 2;

/** "Tháng 10/2026" — tiêu đề nhóm theo tháng như thư viện ảnh Zalo/Messenger */
const monthLabel = (iso: string) => {
  const d = new Date(iso);
  return `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
};

type Row =
  | { type: 'month'; key: string; label: string }
  | { type: 'grid'; key: string; items: RoomMediaItem[]; start: number }
  | { type: 'item'; key: string; item: RoomMediaItem; first: boolean; last: boolean };

/**
 * Kho "Ảnh & video / Tệp / Link" đã gửi trong phòng (GET /chat/rooms/:id/media), chia theo tháng
 * (tiêu đề tháng dính khi cuộn). Ảnh/video lưới 3 cột → bấm mở thư viện vuốt ngang; tệp/link là khối
 * danh sách, bấm để mở, nút "⋯" (hoặc nhấn giữ) → Mở · Sao chép link · Chia sẻ · Xem trong đoạn chat.
 */
export default function RoomMediaScreen() {
  const { roomId, tab: initialTab } = useLocalSearchParams<{ roomId: string; tab?: RoomMediaType }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const brand = useThemeColor('brand');
  const background = useThemeColor('background');
  const foreground = useThemeColor('foreground');
  const { data: token } = useMediaToken();
  const [tab, setTab] = useState<RoomMediaType>(initialTab ?? 'media');
  const [gallery, setGallery] = useState<number | null>(null);
  const [menuFor, setMenuFor] = useState<RoomMediaItem | null>(null);
  const q = useRoomMedia(roomId, tab, tab === 'media' ? 48 : 30);

  const cell = (width - GAP * (COLS - 1)) / COLS;
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);

  // Gom theo tháng; ảnh/video thì chia thành hàng 3 ô để FlashList tái sử dụng theo hàng
  const { rows, sticky } = useMemo(() => {
    const out: Row[] = [];
    const stickyIdx: number[] = [];
    let month = '';
    let bucket: { it: RoomMediaItem; i: number }[] = [];
    let group: RoomMediaItem[] = [];
    const flushGrid = () => {
      for (let i = 0; i < bucket.length; i += COLS) {
        const slice = bucket.slice(i, i + COLS);
        out.push({ type: 'grid', key: `g-${slice[0].it.key ?? slice[0].it.message_id}`, items: slice.map((b) => b.it), start: slice[0].i });
      }
      bucket = [];
    };
    const flushList = () => {
      group.forEach((it, i) =>
        out.push({ type: 'item', key: it.key ?? it.message_id, item: it, first: i === 0, last: i === group.length - 1 }),
      );
      group = [];
    };
    items.forEach((it, i) => {
      const m = monthLabel(it.created_at);
      if (m !== month) {
        if (tab === 'media') flushGrid();
        else flushList();
        month = m;
        stickyIdx.push(out.length);
        out.push({ type: 'month', key: `m-${m}`, label: m });
      }
      if (tab === 'media') bucket.push({ it, i });
      else group.push(it);
    });
    if (tab === 'media') flushGrid();
    else flushList();
    return { rows: out, sticky: stickyIdx };
  }, [items, tab]);

  const goToMessage = (messageId: string) => {
    setRoomIntent({ roomId, type: 'jump', messageId });
    // Về thẳng phòng chat (bỏ qua màn Thông tin nằm giữa)
    router.dismissTo({ pathname: '/chat/[roomId]', params: { roomId } });
  };

  const meta = (it: RoomMediaItem) => `${it.sender.full_name} · ${formatDate(it.created_at)}`;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: 'Ảnh, tệp, link',
          headerShadowVisible: false,
          headerStyle: { backgroundColor: background },
          headerTintColor: foreground,
        }}
      />
      {/* Bộ chọn dạng viên thuốc (segmented control) */}
      <View className="px-4 pb-3">
        <View className="flex-row rounded-full bg-surface-muted p-1">
          {TABS.map((t) => {
            const on = tab === t.value;
            return (
              <Pressable
                key={t.value}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setTab(t.value)}
                className={`h-9 flex-1 items-center justify-center rounded-full ${on ? 'bg-surface' : ''}`}
                style={on ? SEG_SHADOW : undefined}>
                <Text className={`text-[13.5px] font-semibold ${on ? 'text-foreground' : 'text-muted'}`}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {q.isLoading ? (
        <ActivityIndicator className="py-12" color={brand} />
      ) : q.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được"
          description={getErrorMessage(q.error)}
          actionLabel="Thử lại"
          onAction={() => q.refetch()}
        />
      ) : (
        <FlashList
          key={tab}
          data={rows}
          keyExtractor={(r) => r.key}
          getItemType={(r) => r.type}
          stickyHeaderIndices={sticky}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
          }}
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator className="py-4" color={brand} /> : null}
          ListEmptyComponent={
            <StateView
              icon={tab === 'media' ? 'images-outline' : tab === 'file' ? 'document-outline' : 'link-outline'}
              title={tab === 'media' ? 'Chưa có ảnh hay video' : tab === 'file' ? 'Chưa có tệp nào' : 'Chưa có link nào'}
              description="Những gì được gửi trong phòng sẽ hiện ở đây."
            />
          }
          renderItem={({ item: r }) =>
            r.type === 'month' ? (
              <View className="bg-background px-4 pb-2 pt-3">
                <Text className="text-[13px] font-bold text-foreground">{r.label}</Text>
              </View>
            ) : r.type === 'grid' ? (
              <View className="flex-row" style={{ gap: GAP, marginBottom: GAP }}>
                {r.items.map((it, i) => (
                  <MediaTile
                    key={it.key ?? it.message_id}
                    item={it}
                    size={cell}
                    token={token?.media_token}
                    onPress={() => setGallery(r.start + i)}
                    onLongPress={() => goToMessage(it.message_id)}
                  />
                ))}
              </View>
            ) : (
              <View
                className={`mx-4 overflow-hidden border-x border-border bg-surface ${r.first ? 'rounded-t-2xl border-t' : ''} ${
                  r.last ? 'mb-2 rounded-b-2xl border-b' : ''
                }`}>
                {r.item.kind === 'file' ? (
                  <FileRow
                    item={r.item}
                    token={token?.media_token}
                    meta={meta(r.item)}
                    onLongPress={() => setMenuFor(r.item)}
                    onMore={() => setMenuFor(r.item)}
                  />
                ) : (
                  <LinkRow
                    item={r.item}
                    meta={meta(r.item)}
                    brand={brand}
                    onLongPress={() => setMenuFor(r.item)}
                    onMore={() => setMenuFor(r.item)}
                  />
                )}
                {!r.last ? <View className="absolute bottom-0 right-0 h-px bg-border" style={{ left: 72 }} /> : null}
              </View>
            )
          }
        />
      )}

      <MediaGallery
        items={tab === 'media' ? items : []}
        index={gallery}
        token={token?.media_token}
        onClose={() => setGallery(null)}
        onGoToMessage={goToMessage}
      />
      <ItemMenu item={menuFor} token={token?.media_token} onClose={() => setMenuFor(null)} onGoToMessage={goToMessage} />
    </View>
  );
}

const SEG_SHADOW = { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 };

/** Menu "⋯" của 1 tệp / link. */
function ItemMenu({
  item,
  token,
  onClose,
  onGoToMessage,
}: {
  item: RoomMediaItem | null;
  token?: string;
  onClose: () => void;
  onGoToMessage: (messageId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  if (!item) return null;
  const url = item.kind === 'link' ? (item.url ?? '') : (resolveMediaUrl(item.url, token) ?? '');
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} accessibilityLabel="Đóng" />
        <View className="gap-1 rounded-t-3xl bg-surface px-3 pt-2.5" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="mb-2 h-1 w-10 self-center rounded-full bg-border" />
          <Text className="px-3 pb-2 text-[14px] font-semibold text-foreground" numberOfLines={2}>
            {item.kind === 'link' ? item.url : item.file_name}
          </Text>
          <MenuRow
            icon="open-outline"
            label={item.kind === 'link' ? 'Mở link' : 'Mở tệp'}
            onPress={run(() => url && void Linking.openURL(url))}
          />
          {item.kind === 'link' ? (
            <MenuRow icon="copy-outline" label="Sao chép link" onPress={run(() => void Clipboard.setStringAsync(url))} />
          ) : null}
          <MenuRow icon="share-outline" label="Chia sẻ" onPress={run(() => url && void Share.share({ message: url, url }))} />
          <MenuRow icon="chatbubble-ellipses-outline" label="Xem trong đoạn chat" onPress={run(() => onGoToMessage(item.message_id))} />
        </View>
      </View>
    </Modal>
  );
}

function MenuRow({ icon, label, onPress }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void }) {
  const fg = useThemeColor('foreground');
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3.5 rounded-xl px-3 py-3.5 active:bg-surface-muted">
      <Ionicons name={icon} size={21} color={fg} />
      <Text className="text-[15px] text-foreground">{label}</Text>
    </Pressable>
  );
}
