import { Stack, useLocalSearchParams } from 'expo-router';
import { RefreshControl, ScrollView, View } from 'react-native';

import { LoadingView, StateView } from '@/components/ui/state-view';
import { useMyClassAssignments } from '@/features/assignments/api';
import { useClassInfo, useStudentAttendance } from '@/features/classes/api';
import { ClassReportView } from '@/features/classes/class-report';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

/** Báo cáo học tập của một lớp: điểm từng bài, chuyên cần, nhận xét. */
export default function ClassReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = useAuthStore((s) => s.user?._id);
  const brand = useThemeColor('brand');

  const info = useClassInfo(id);
  const attendance = useStudentAttendance(id, userId);
  const report = useMyClassAssignments(id, true);
  const sessions = [...(attendance.data ?? [])].reverse();
  const pull = usePullRefresh(() => Promise.all([report.refetch(), attendance.refetch()]));

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: info.data?.class_code ? `Báo cáo · ${info.data.class_code}` : 'Báo cáo', headerShown: true }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 28, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
        {report.isLoading ? (
          <LoadingView />
        ) : report.isError ? (
          <StateView icon="cloud-offline-outline" title="Không tải được báo cáo" actionLabel="Thử lại" onAction={() => report.refetch()} />
        ) : (
          <ClassReportView
            assignments={report.data ?? []}
            sessions={sessions}
            attendanceRate={info.data?.attendance_stats?.attendance_rate ?? null}
          />
        )}
      </ScrollView>
    </View>
  );
}
