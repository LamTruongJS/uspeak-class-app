import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, RefreshControl, View } from 'react-native';

import { LoadingView, StateView } from '@/components/ui/state-view';
import { useClassInfo, useStudentAttendance, type AttendanceSession } from '@/features/classes/api';
import { AttendanceOverview, AttendanceRow } from '@/features/classes/attendance-view';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

/** Điểm danh của một lớp — buổi mới nhất lên đầu, có thẻ tổng quan ở trên. */
export default function ClassAttendanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useAuthStore((s) => s.user?._id);
  const brand = useThemeColor('brand');

  const info = useClassInfo(id);
  const attendance = useStudentAttendance(id, userId);
  const sessions: AttendanceSession[] = [...(attendance.data ?? [])].reverse();
  const pull = usePullRefresh(() => attendance.refetch());

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: info.data?.class_code ? `Điểm danh · ${info.data.class_code}` : 'Điểm danh', headerShown: true }} />
      <FlatList
        data={sessions}
        keyExtractor={(s) => `${s.session_number}-${s.date}`}
        renderItem={({ item, index }) => (
          <View className="px-4">
            <AttendanceRow session={item} first={index === 0} last={index === sessions.length - 1} />
          </View>
        )}
        ListHeaderComponent={
          sessions.length ? (
            <View className="px-4 pb-4">
              <AttendanceOverview sessions={sessions} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          attendance.isLoading ? (
            <LoadingView />
          ) : attendance.isError ? (
            <StateView
              icon="cloud-offline-outline"
              title="Không tải được điểm danh"
              actionLabel="Thử lại"
              onAction={() => attendance.refetch()}
            />
          ) : (
            <StateView icon="calendar-outline" title="Chưa có buổi học nào được điểm danh" />
          )
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 28, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
      />
    </View>
  );
}
