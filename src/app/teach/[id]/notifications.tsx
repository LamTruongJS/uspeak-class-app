import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { useActionSheet } from '@/components/ui/action-sheet';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { useClassNotificationList, useManageClassNotification, type ClassNotification } from '@/features/class-notifications/api';
import { NotificationCard, useNotificationReader } from '@/features/class-notifications/notification-card';
import { NotificationFormSheet } from '@/features/class-notifications/notification-form';
import { useStaffClasses } from '@/features/classes/staff-api';
import { getErrorMessage } from '@/lib/api/client';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Thông báo lớp (nhân sự) — gồm cả thông báo hẹn giờ và đã hết hiệu lực. Tạo (nút + / nút cuối màn),
 * sửa, xoá ngay trong app (NotificationFormSheet) — không còn mở web.
 */
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
  const fg = useThemeColor('foreground');
  const manage = useManageClassNotification(id);
  const [form, setForm] = useState<{ item?: ClassNotification } | null>(null);
  const sheet = useActionSheet();
  const confirmDelete = (n: ClassNotification) =>
    sheet.confirm({
      title: 'Xoá thông báo?',
      message: 'Học viên sẽ không còn thấy thông báo này.',
      label: 'Xoá',
      icon: 'trash-outline',
      onConfirm: () => manage.remove.mutate(n._id, { onError: (e) => showToast('error', 'Không xoá được', getErrorMessage(e)) }),
    });

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: cls?.class_code ? `Thông báo · ${cls.class_code}` : 'Thông báo lớp',
          headerShown: true,
          headerRight: () => (
            <Pressable onPress={() => setForm({})} hitSlop={10} accessibilityLabel="Tạo thông báo" className="active:opacity-60">
              <Ionicons name="add-circle-outline" size={25} color={fg} />
            </Pressable>
          ),
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
              onEdit={() => setForm({ item })}
              onDelete={() => confirmDelete(item)}
            />
          </View>
        )}
        ListHeaderComponent={
          items.length ? (
            <Text className="px-5 pb-3 text-[12.5px] text-muted">
              Gồm cả thông báo hẹn giờ và đã hết hiệu lực. Bấm một thông báo để sửa / xoá, nút + để tạo mới.
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
            <StateView icon="megaphone-outline" title="Lớp chưa có thông báo nào" actionLabel="Tạo thông báo" onAction={() => setForm({})} />
          )
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 28, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
      />
      {sheet.sheet}
      {form ? <NotificationFormSheet classId={id} item={form.item} onClose={() => setForm(null)} /> : null}
    </View>
  );
}
