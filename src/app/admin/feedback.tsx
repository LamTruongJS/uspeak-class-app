import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { roomTime } from '@/features/chat/format';
import {
  FEEDBACK_STATUS_VIEW,
  FEEDBACK_TYPE_LABEL,
  useAllFeedback,
  type FeedbackItem,
  type FeedbackStatus,
  type FeedbackType,
} from '@/features/feedback/api';
import { menuScreenOptions } from '@/features/navigation/app-menu';
import { getErrorMessage } from '@/lib/api/client';
import { htmlToPlain } from '@/components/ui/rich-text';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

const STATUS_FILTERS: { value: FeedbackStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'NEW', label: 'Chờ xử lý' },
  { value: 'REPLIED', label: 'Đã phản hồi' },
  { value: 'CLOSED', label: 'Đã đóng' },
];

const TYPE_FILTERS: { value: FeedbackType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Mọi loại' },
  { value: 'BUG', label: 'Báo lỗi' },
  { value: 'FEATURE', label: 'Đề xuất' },
  { value: 'FEEDBACK', label: 'Góp ý' },
  { value: 'OTHER', label: 'Khác' },
];

/**
 * Quản lý góp ý (admin) — bản mobile của trang /admin/feedback.
 *
 * Web là bảng + ô lọc; trên điện thoại đổi thành danh sách thẻ + chip lọc xuống dòng, bấm một thẻ là
 * mở thẳng luồng trò chuyện (dùng lại màn chi tiết góp ý, chỉ đổi góc nhìn sang admin).
 */
export default function AdminFeedbackScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [status, setStatus] = useState<FeedbackStatus | 'ALL'>('ALL');
  const [type, setType] = useState<FeedbackType | 'ALL'>('ALL');

  const query = useAllFeedback({
    search: applied || undefined,
    status: status === 'ALL' ? undefined : status,
    type: type === 'ALL' ? undefined : type,
  });
  const pull = usePullRefresh(() => query.refetch());
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  const total = query.data?.pages[0]?.pagination?.total ?? 0;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Quản lý góp ý', ...menuScreenOptions }} />

      <View className="gap-2.5 px-4 pb-1 pt-2">
        <View className="h-11 flex-row items-center gap-2 rounded-xl bg-surface-muted px-3">
          <Ionicons name="search" size={18} color={muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => setApplied(search.trim())}
            onBlur={() => setApplied(search.trim())}
            placeholder="Tìm người gửi, email, nội dung…"
            placeholderTextColor={muted}
            autoCorrect={false}
            returnKeyType="search"
            className="flex-1 text-[15px] text-foreground"
          />
          {search ? (
            <Pressable
              hitSlop={8}
              onPress={() => {
                setSearch('');
                setApplied('');
              }}
              accessibilityLabel="Xoá ô tìm">
              <Ionicons name="close-circle" size={18} color={muted} />
            </Pressable>
          ) : query.isFetching && !query.isLoading ? (
            <ActivityIndicator size="small" color={brand} />
          ) : null}
        </View>

        <View className="flex-row flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} on={status === f.value} onPress={() => setStatus(f.value)} />
          ))}
        </View>
        <View className="flex-row flex-wrap gap-1.5">
          {TYPE_FILTERS.map((f) => (
            <Chip key={f.value} label={f.label} on={type === f.value} onPress={() => setType(f.value)} subtle />
          ))}
        </View>
        {total ? <Text className="text-[12.5px] font-medium text-muted">{total.toLocaleString('vi-VN')} góp ý</Text> : null}
      </View>

      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được danh sách"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(i) => i._id}
          renderItem={({ item }) => <Row item={item} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator className="py-4" color={brand} /> : null}
          ListEmptyComponent={<StateView icon="chatbubbles-outline" title="Không có góp ý nào khớp bộ lọc" />}
        />
      )}
    </View>
  );
}

function Chip({ label, on, onPress, subtle }: { label: string; on: boolean; onPress: () => void; subtle?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      className={`h-8 items-center justify-center rounded-full px-3 active:opacity-80 ${
        on ? (subtle ? 'bg-brand-soft' : 'bg-brand') : 'bg-surface-muted'
      }`}>
      <Text className={`text-[13px] font-semibold ${on ? (subtle ? 'text-brand' : 'text-on-brand') : 'text-muted'}`}>{label}</Text>
    </Pressable>
  );
}

function Row({ item }: { item: FeedbackItem }) {
  const view = FEEDBACK_STATUS_VIEW[item.status] ?? FEEDBACK_STATUS_VIEW.NEW;
  // Lượt nhắn cuối cho biết đang chờ ai: học viên nhắn sau cùng = tới lượt mình trả lời.
  const last = item.messages?.length ? item.messages[item.messages.length - 1] : undefined;
  const waiting = item.status !== 'CLOSED' && (!last || last.senderType === 'USER');
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/feedback/[id]', params: { id: item._id, admin: '1' } })}
      className="mb-2.5 gap-2 rounded-2xl border border-border bg-surface p-3.5 active:opacity-80">
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-[15px] font-bold text-foreground" numberOfLines={1}>
          {item.userName || 'Người dùng'}
        </Text>
        <Text className="text-[11.5px] text-muted">{roomTime(item.createdAt)}</Text>
      </View>
      <Text className="text-[13.5px] leading-5 text-muted" numberOfLines={2}>
        {htmlToPlain(item.message)}
      </Text>
      <View className="flex-row items-center gap-1.5">
        <Badge label={FEEDBACK_TYPE_LABEL[item.type] ?? item.type} tone="info" />
        <Badge label={view.label} tone={view.tone} />
        {waiting ? <Badge label="Chờ mình trả lời" tone="danger" /> : null}
        <View className="flex-1" />
        {item.images?.length ? (
          <View className="flex-row items-center gap-0.5">
            <Ionicons name="image-outline" size={13} color="#9ca3af" />
            <Text className="text-[11.5px] text-muted">{item.images.length}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
