import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { showToast } from '@/components/ui/toast';
import { useStudentRowFromCache, useStudentSurveys } from '@/features/student-info/api';
import { SurveyCard } from '@/features/student-info/survey-card';
import { getErrorMessage } from '@/lib/api/client';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Chi tiết 1 học viên — gộp cột "Lớp học" của bảng web với hộp thoại "Khảo sát của …"
 * (StudentSurveysDialog) thành một màn cuộn dọc. Chỉ đọc, như web.
 */
export default function StudentInfoDetailScreen() {
  const params = useLocalSearchParams<{ userId: string; name?: string; email?: string }>();
  const userId = params.userId ?? '';
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const row = useStudentRowFromCache(userId);
  const query = useStudentSurveys(userId);
  const pull = usePullRefresh(() => query.refetch());

  const name = query.data?.student.name || row?.name || params.name || 'Học viên';
  const email = query.data?.student.email || row?.email || params.email || '';
  const surveys = query.data?.surveys ?? [];

  const copyEmail = async () => {
    if (!email) return;
    await Clipboard.setStringAsync(email);
    showToast('success', 'Đã sao chép email');
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Thông tin học viên' }} />
      <ScrollView
        contentContainerClassName="gap-4 px-4 pb-10 pt-2"
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
        <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row items-center gap-3">
            <Avatar name={name} size={52} />
            <View className="shrink gap-0.5">
              <Text className="text-[17px] font-bold text-foreground">{name}</Text>
              {email ? (
                <Pressable
                  onPress={copyEmail}
                  className="flex-row items-center gap-1 active:opacity-70"
                  accessibilityLabel="Sao chép email">
                  <Text className="shrink text-[13px] text-muted" numberOfLines={1}>
                    {email}
                  </Text>
                  <Ionicons name="copy-outline" size={13} color={muted} />
                </Pressable>
              ) : null}
            </View>
          </View>

          {row ? (
            <View className="gap-1.5">
              <Text className="text-[11.5px] font-bold uppercase tracking-wider text-muted">Lớp đang học</Text>
              {row.classes.length ? (
                row.classes.map((c) => (
                  <View key={c._id} className="flex-row items-center gap-2">
                    <Badge label={c.class_code || 'Lớp'} tone="info" />
                    <Text className="shrink text-[13px] text-foreground" numberOfLines={1}>
                      {c.class_name}
                    </Text>
                  </View>
                ))
              ) : (
                <Text className="text-[13px] text-muted">Không có lớp đang học</Text>
              )}
            </View>
          ) : null}
        </View>

        {query.isLoading ? (
          <LoadingView />
        ) : query.isError ? (
          <StateView
            icon="cloud-offline-outline"
            title="Không tải được khảo sát"
            description={getErrorMessage(query.error)}
            actionLabel="Thử lại"
            onAction={() => query.refetch()}
          />
        ) : surveys.length === 0 ? (
          <StateView icon="file-tray-outline" title="Học viên chưa làm khảo sát nào" />
        ) : (
          <>
            <Text className="text-[13px] text-muted">
              Đã làm <Text className="font-bold text-foreground">{surveys.length}</Text> phiếu khảo sát
            </Text>
            {surveys.map((survey) => (
              <SurveyCard key={survey._id} survey={survey} />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
