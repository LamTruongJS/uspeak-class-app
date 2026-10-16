import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { fold } from '@/features/chat/mentions';
import { avatarColor } from '@/features/chat/room-avatar';
import { isMyClass, STATUS_META, useStaffClasses, type StaffClassItem } from '@/features/classes/staff-api';
import { getErrorMessage } from '@/lib/api/client';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';
import { menuScreenOptions } from '@/features/navigation/app-menu';

/** Bảng điểm — chọn lớp trước (web cũng là màn chọn lớp rồi mới mở bảng điểm của lớp đó). */
export default function GradebookPickerScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const [search, setSearch] = useState('');
  const [onlyActive, setOnlyActive] = useState(true);
  const myId = useAuthStore((st) => st.user?._id);
  const q = useDeferredValue(fold(search.trim()));

  const classes = useStaffClasses();
  const pull = usePullRefresh(() => classes.refetch());

  // Lớp đang dạy lên trước, lớp của tôi trước lớp khác; mặc định ẩn lớp đã kết thúc
  const ORDER: Record<string, number> = { IN_PROGRESS: 0, CLOSED_REGISTRATION: 1, OPEN_REGISTRATION: 2, ENDED: 3 };
  const items = useMemo(() => {
    let list = classes.data ?? [];
    if (onlyActive && !q) list = list.filter((c) => c.status_class !== 'ENDED');
    if (q) list = list.filter((c) => fold(`${c.class_code} ${c.class_name} ${c.display_name ?? ''}`).includes(q));
    return [...list].sort(
      (a, b) =>
        Number(!isMyClass(a, myId)) - Number(!isMyClass(b, myId)) ||
        (ORDER[a.status_class] ?? 9) - (ORDER[b.status_class] ?? 9) ||
        a.class_code.localeCompare(b.class_code),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes.data, q, onlyActive, myId]);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Bảng điểm', ...menuScreenOptions }} />
      {classes.isLoading ? (
        <LoadingView />
      ) : classes.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được danh sách lớp"
          description={getErrorMessage(classes.error)}
          actionLabel="Thử lại"
          onAction={() => classes.refetch()}
        />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(c: StaffClassItem) => c._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListHeaderComponent={
            <View className="gap-3 pb-1">
              <Text className="text-[13px] text-muted">Chọn lớp để xem bảng điểm tổng hợp.</Text>
              <View className="h-11 flex-row items-center gap-2 rounded-full bg-surface-muted px-4">
                <Ionicons name="search" size={18} color={muted} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Tìm lớp…"
                  placeholderTextColor={muted}
                  autoCorrect={false}
                  className="flex-1 text-base text-foreground"
                />
                {search ? (
                  <Pressable hitSlop={8} onPress={() => setSearch('')}>
                    <Ionicons name="close-circle" size={18} color={muted} />
                  </Pressable>
                ) : null}
              </View>
              <View className="flex-row gap-2">
                {(
                  [
                    [true, 'Đang hoạt động'],
                    [false, 'Tất cả lớp'],
                  ] as [boolean, string][]
                ).map(([v, label]) => (
                  <Pressable
                    key={label}
                    onPress={() => setOnlyActive(v)}
                    className={`h-8 justify-center rounded-full border px-3.5 ${onlyActive === v ? 'border-brand bg-brand-soft' : 'border-border bg-surface'}`}>
                    <Text className={`text-[13px] font-semibold ${onlyActive === v ? 'text-brand' : 'text-muted'}`}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={<StateView icon="school-outline" title="Không tìm thấy lớp" />}
          renderItem={({ item }) => {
            const status = STATUS_META[item.status_class] ?? STATUS_META.ENDED;
            return (
              <Pressable
                onPress={() => router.push({ pathname: '/grading/gradebook/[classId]', params: { classId: item._id } })}
                className="flex-row items-center gap-3 rounded-3xl bg-surface p-3.5 active:bg-surface-muted">
                <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: avatarColor(item._id) }}>
                  <Ionicons name="podium" size={19} color="#fff" />
                </View>
                <View className="flex-1 gap-1">
                  <Text className="text-[15px] font-semibold text-foreground" numberOfLines={1}>
                    {item.display_name || item.class_name}
                  </Text>
                  <View className="flex-row flex-wrap items-center gap-1.5">
                    <Badge label={item.class_code} tone="brand" />
                    <Badge label={status.label} tone={status.tone} />
                    <Text className="text-[11px] text-muted">
                      {item.active_students} HV · {item.assignment_count ?? 0} bài
                    </Text>
                    {isMyClass(item, myId) ? <Badge label="Lớp của tôi" tone="success" /> : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={muted} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
