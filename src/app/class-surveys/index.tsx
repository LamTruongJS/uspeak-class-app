import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { useStudentSurveys, type PendingSurveyItem } from '@/features/surveys/class-survey';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Phiếu khảo sát của học viên — bản mobile của tab "Phiếu khảo sát" trong chi tiết lớp (web).
 * Mở từ màn chi tiết lớp thì truyền `classId` để chỉ hiện phiếu của lớp đó; mở từ "Tất cả tính
 * năng" thì hiện phiếu của mọi lớp, phiếu chưa làm xếp lên đầu.
 */
export default function ClassSurveysScreen() {
  const { classId, className } = useLocalSearchParams<{ classId?: string; className?: string }>();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');

  const query = useStudentSurveys();
  const pull = usePullRefresh(() => query.refetch());

  const items = useMemo(() => {
    const all = query.data?.data ?? [];
    const scoped = classId ? all.filter((s) => s.class_id === classId) : all;
    // Chưa làm lên trước, trong mỗi nhóm giữ nguyên thứ tự CRM trả về
    return [...scoped].sort((a, b) => Number(a.submitted) - Number(b.submitted));
  }, [query.data, classId]);

  const pending = items.filter((s) => !s.submitted).length;

  const header = (
    <View className="gap-2 pb-1">
      <Text className="text-[13px] text-muted">
        {classId ? `Phiếu khảo sát của lớp ${className || ''}`.trim() : 'Phiếu khảo sát các lớp bạn đang học'} ·{' '}
        {items.length} phiếu{pending ? ` · ${pending} chưa làm` : ''}
      </Text>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Phiếu khảo sát' }} />
      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được phiếu khảo sát"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(s: PendingSurveyItem) => `${s.template_id}-${s.class_id}`}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListEmptyComponent={
            <StateView
              icon="checkmark-circle-outline"
              title="Không có phiếu khảo sát"
              description={classId ? 'Lớp này hiện chưa có phiếu khảo sát nào.' : 'Các lớp của bạn hiện chưa có phiếu khảo sát nào.'}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/class-surveys/[templateId]',
                  params: { templateId: item.template_id, classId: item.class_id, title: item.template_title },
                })
              }
              className={`gap-2 rounded-2xl border bg-surface p-3.5 active:bg-surface-muted ${item.submitted ? 'border-border' : 'border-brand'}`}>
              <View className="flex-row items-center gap-2">
                <Badge label={item.submitted ? 'Đã gửi' : 'Chưa làm'} tone={item.submitted ? 'success' : 'warning'} />
                {!classId ? <Badge label={item.class_code || item.class_name} tone="brand" /> : null}
                <View className="flex-1" />
                <Ionicons name="chevron-forward" size={16} color={muted} />
              </View>

              <Text className="text-[15px] font-semibold leading-5 text-foreground" numberOfLines={2}>
                {item.template_title}
              </Text>
              {item.template_description ? (
                <Text className="text-[13px] leading-5 text-muted" numberOfLines={2}>
                  {item.template_description}
                </Text>
              ) : null}

              <View className="flex-row items-center gap-3">
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="list-outline" size={13} color={muted} />
                  <Text className="text-[11px] text-muted">{item.field_count} câu hỏi</Text>
                </View>
                {item.submitted && item.submitted_at ? (
                  <Text className="text-[11px] text-success">Gửi lúc {formatDateTime(item.submitted_at)}</Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
