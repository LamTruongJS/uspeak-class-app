import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';

import { LoadingView, StateView } from '@/components/ui/state-view';
import { useActiveClassNotifications } from '@/features/class-notifications/api';
import { NotificationCard, useNotificationReader } from '@/features/class-notifications/notification-card';
import { useClassInfo } from '@/features/classes/api';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/** Thông báo còn hiệu lực của một lớp. Mở thẻ ra là đánh dấu đã xem (chỉ sửa cache, xem api.ts). */
export default function ClassNotificationsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  // Mốc giờ cố định lúc vào màn: tính "còn mấy ngày" khi render là mỗi lần vẽ lại một kết quả khác.
  const [now] = useState(() => Date.now());

  const info = useClassInfo(id);
  const notifications = useActiveClassNotifications(id);
  const items = notifications.data?.pages.flatMap((p) => p.data) ?? [];
  const reader = useNotificationReader(id, items);
  const pull = usePullRefresh(() => notifications.refetch());

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: info.data?.class_code ? `Thông báo · ${info.data.class_code}` : 'Thông báo lớp', headerShown: true }} />
      <FlatList
        data={items}
        keyExtractor={(n) => n._id}
        extraData={reader.expandedId}
        renderItem={({ item }) => (
          <View className="px-4 pb-3">
            <NotificationCard
              item={item}
              now={now}
              expanded={reader.expandedId === item._id}
              onToggle={() => reader.toggle(item._id)}
            />
          </View>
        )}
        ListEmptyComponent={
          notifications.isLoading ? (
            <LoadingView />
          ) : notifications.isError ? (
            <StateView
              icon="cloud-offline-outline"
              title="Không tải được thông báo"
              actionLabel="Thử lại"
              onAction={() => notifications.refetch()}
            />
          ) : (
            <StateView icon="megaphone-outline" title="Chưa có thông báo nào" />
          )
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 28, flexGrow: 1 }}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (notifications.hasNextPage && !notifications.isFetchingNextPage) void notifications.fetchNextPage();
        }}
        ListFooterComponent={notifications.isFetchingNextPage ? <ActivityIndicator className="py-3" color={brand} /> : null}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
      />
    </View>
  );
}
