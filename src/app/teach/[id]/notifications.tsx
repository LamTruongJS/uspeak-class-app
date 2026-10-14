import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { LoadingView, StateView } from '@/components/ui/state-view';
import { useClassNotificationList } from '@/features/class-notifications/api';
import { NotificationCard, useNotificationReader } from '@/features/class-notifications/notification-card';
import { ClassWebButton } from '@/features/classes/open-class-web';
import { useStaffClasses } from '@/features/classes/staff-api';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/** Thông báo lớp (giáo viên) — gồm cả thông báo hẹn giờ và đã hết hiệu lực. Chỉ xem. */
export default function ClassNotificationsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  // Mốc giờ cố định lúc vào màn: tính "còn mấy ngày" khi render là mỗi lần vẽ lại một kết quả khác.
  const [now] = useState(() => Date.now());

  const classes = useStaffClasses();
  const cls = classes.data?.find((c) => c._id === id);
  const notifications = useClassNotificationList(id, true);
  const items = notifications.data ?? [];
  const reader = useNotificationReader(id, items, true);
  const pull = usePullRefresh(() => notifications.refetch());

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: cls?.class_code ? `Thông báo · ${cls.class_code}` : 'Thông báo lớp',
          headerShown: true,
          headerRight: () => <ClassWebButton classId={id} tab="notifications" />,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(n) => n._id}
        extraData={reader.expandedId}
        renderItem={({ item }) => (
          <View className="px-4 pb-2.5">
            <NotificationCard
              item={item}
              now={now}
              canManage
              expanded={reader.expandedId === item._id}
              onToggle={() => reader.toggle(item._id)}
            />
          </View>
        )}
        ListHeaderComponent={
          items.length ? (
            <Text className="px-5 pb-3 text-[12.5px] text-muted">
              Gồm cả thông báo hẹn giờ và đã hết hiệu lực. Tạo / sửa thông báo dùng nút màn hình bản web ở góc trên.
            </Text>
          ) : null
        }
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
            <StateView icon="megaphone-outline" title="Lớp chưa có thông báo nào" />
          )
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 28, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
      />
    </View>
  );
}
