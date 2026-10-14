import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { LoadingView, StateView } from '@/components/ui/state-view';
import { STATUS_FILTERS, useMyAssignments, type AssignmentStatusFilter } from '@/features/assignments/api';
import { AssignmentCard } from '@/features/assignments/assignment-card';
import { openAssignment } from '@/features/assignments/detail-api';
import { useClassInfo } from '@/features/classes/api';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/** Bài tập của một lớp. Mở từ trang tổng quan lớp; `status` cho phép mở thẳng vào "Chưa nộp". */
export default function ClassAssignmentsScreen() {
  const { id, status: initialStatus } = useLocalSearchParams<{ id: string; status?: AssignmentStatusFilter }>();
  const brand = useThemeColor('brand');
  const [status, setStatus] = useState<AssignmentStatusFilter>(initialStatus ?? 'all');

  const info = useClassInfo(id);
  const assignments = useMyAssignments({ classId: id, status });
  const items = assignments.data?.pages.flatMap((p) => p.data) ?? [];
  const pull = usePullRefresh(() => assignments.refetch());

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: info.data?.class_code ? `Bài tập · ${info.data.class_code}` : 'Bài tập', headerShown: true }} />
      <FlatList
        data={items}
        keyExtractor={(a) => a._id}
        renderItem={({ item }) => (
          <View className="px-4 pb-3">
            <AssignmentCard item={item} onPress={() => openAssignment(item)} />
          </View>
        )}
        ListHeaderComponent={<StatusFilter value={status} onChange={setStatus} />}
        ListEmptyComponent={
          assignments.isLoading ? (
            <LoadingView />
          ) : assignments.isError ? (
            <StateView
              icon="cloud-offline-outline"
              title="Không tải được bài tập"
              actionLabel="Thử lại"
              onAction={() => assignments.refetch()}
            />
          ) : (
            <StateView
              icon="document-text-outline"
              title={status === 'all' ? 'Chưa có bài tập nào' : 'Không có bài tập phù hợp'}
            />
          )
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 28, flexGrow: 1 }}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (assignments.hasNextPage && !assignments.isFetchingNextPage) void assignments.fetchNextPage();
        }}
        ListFooterComponent={assignments.isFetchingNextPage ? <ActivityIndicator className="py-3" color={brand} /> : null}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
      />
    </View>
  );
}

/** Bộ lọc trạng thái — hàng chip ngắn, nằm ngay đầu danh sách. */
function StatusFilter({ value, onChange }: { value: AssignmentStatusFilter; onChange: (v: AssignmentStatusFilter) => void }) {
  return (
    <View className="flex-row flex-wrap gap-2 px-4 pb-3.5">
      {STATUS_FILTERS.map((f) => {
        const active = f.value === value;
        return (
          <Pressable
            key={f.value}
            onPress={() => onChange(f.value)}
            className={`h-8 justify-center rounded-full border px-3.5 ${active ? 'border-brand bg-brand-soft' : 'border-border bg-surface'}`}>
            <Text className={`text-[13px] font-semibold ${active ? 'text-brand' : 'text-muted'}`}>{f.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
