import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';

import { LoadingView, StateView } from '@/components/ui/state-view';
import { useClassAssignments } from '@/features/assignments/class-api';
import { ClassAssignmentCard } from '@/features/assignments/class-assignment-card';
import { ClassWebButton } from '@/features/classes/open-class-web';
import { useStaffClassDetail, useStaffClasses } from '@/features/classes/staff-api';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/** Bài tập của lớp (giáo viên) — bấm thẻ để xem chi tiết tỷ lệ nộp. */
export default function ClassAssignmentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const [now] = useState(() => Date.now());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const classes = useStaffClasses();
  const cls = classes.data?.find((c) => c._id === id);
  const detail = useStaffClassDetail(id);
  const assignments = useClassAssignments(id, true);
  const items = assignments.data?.pages.flatMap((p) => p.data) ?? [];
  const pull = usePullRefresh(() => assignments.refetch());

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: cls?.class_code ? `Bài tập · ${cls.class_code}` : 'Bài tập',
          headerShown: true,
          headerRight: () => <ClassWebButton classId={id} tab="assignments" />,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(a) => a._id}
        extraData={expandedId}
        renderItem={({ item }) => (
          <View className="px-4 pb-2.5">
            <ClassAssignmentCard
              item={item}
              totalStudents={detail.data?.stats?.total_students}
              expanded={expandedId === item._id}
              overdue={!!item.submission_deadline && new Date(item.submission_deadline).getTime() < now}
              onToggle={() => setExpandedId((c) => (c === item._id ? null : item._id))}
            />
          </View>
        )}
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
            <StateView icon="document-text-outline" title="Lớp chưa có bài tập nào" />
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
