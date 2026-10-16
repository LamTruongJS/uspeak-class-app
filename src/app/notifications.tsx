import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { Segmented } from '@/components/ui/segmented';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { showToast } from '@/components/ui/toast';
import {
  notificationLook,
  openNotification,
  timeAgo,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationList,
  useUnreadNotificationCount,
  type AppNotification,
} from '@/features/notifications/api';
import { getErrorMessage } from '@/lib/api/client';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

type Tab = 'all' | 'unread';

// Viết đủ tên class để Tailwind quét được
const TONE_BG: Record<string, string> = {
  brand: 'bg-brand-soft',
  info: 'bg-info-soft',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
  violet: 'bg-violet-soft',
};

/**
 * Thông báo (bản mobile của panel chuông bên web): Tất cả / Chưa đọc, cuộn tải thêm, "Đọc hết".
 * Bấm 1 thông báo → đánh dấu đã đọc + mở đúng màn (openNotification).
 */
export default function NotificationsScreen() {
  const brand = useThemeColor('brand');
  const [tab, setTab] = useState<Tab>('all');
  const [now] = useState(() => Date.now());
  const list = useNotificationList();
  const unread = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const pull = usePullRefresh(() => Promise.all([list.refetch(), unread.refetch()]));

  const all = useMemo(() => list.data?.pages.flatMap((p) => p.data ?? []) ?? [], [list.data]);
  const items = tab === 'unread' ? all.filter((n) => !n.read) : all;
  const unreadCount = unread.data ?? all.filter((n) => !n.read).length;

  const open = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n._id);
    openNotification(n);
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: 'Thông báo',
          headerShown: true,
          headerRight: () =>
            unreadCount > 0 ? (
              <Pressable
                onPress={() => markAll.mutate(undefined, { onError: (e) => showToast('error', 'Chưa đánh dấu được', getErrorMessage(e)) })}
                disabled={markAll.isPending}
                hitSlop={8}
                className="flex-row items-center gap-1 active:opacity-60">
                <Ionicons name="checkmark-done" size={18} color={brand} />
                <Text className="text-[14px] font-semibold text-brand">Đọc hết</Text>
              </Pressable>
            ) : null,
        }}
      />
      <View className="px-4 pb-2 pt-2">
        <Segmented<Tab>
          items={[
            { value: 'all', label: 'Tất cả' },
            { value: 'unread', label: 'Chưa đọc', count: unreadCount || undefined },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {list.isLoading ? (
        <LoadingView />
      ) : list.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được thông báo"
          description={getErrorMessage(list.error)}
          actionLabel="Thử lại"
          onAction={() => list.refetch()}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n._id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32, flexGrow: 1 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
          ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator className="py-4" color={brand} /> : null}
          ListEmptyComponent={
            <StateView
              icon="notifications-off-outline"
              title={tab === 'unread' ? 'Bạn đã đọc hết thông báo' : 'Chưa có thông báo nào'}
              description={tab === 'unread' ? undefined : 'Bài tập mới, kết quả nhận xét, yêu cầu thanh toán… sẽ hiện ở đây.'}
            />
          }
          renderItem={({ item }) => <NotificationRow n={item} now={now} onPress={() => open(item)} />}
        />
      )}
    </View>
  );
}

function NotificationRow({ n, now, onPress }: { n: AppNotification; now: number; onPress: () => void }) {
  const look = notificationLook(n.type);
  const color = useThemeColor(look.tone);
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row gap-3 rounded-2xl border p-3.5 active:opacity-80 ${n.read ? 'border-border bg-surface' : 'border-brand/25 bg-brand-soft/40'}`}>
      <View className={`h-10 w-10 items-center justify-center rounded-full ${TONE_BG[look.tone]}`}>
        <Ionicons name={look.icon} size={19} color={color} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className={`text-[14.5px] text-foreground ${n.read ? 'font-semibold' : 'font-bold'}`} numberOfLines={2}>
          {n.title}
        </Text>
        {n.message ? (
          <Text className="text-[13px] leading-[18px] text-muted" numberOfLines={3}>
            {n.message}
          </Text>
        ) : null}
        <Text className={`mt-0.5 text-[11.5px] ${n.read ? 'text-muted' : 'font-semibold text-brand'}`}>{timeAgo(n.createdAt, now)}</Text>
      </View>
      {!n.read ? <View className="mt-1.5 h-2.5 w-2.5 rounded-full bg-brand" /> : null}
    </Pressable>
  );
}
