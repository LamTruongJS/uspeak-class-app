import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { LoadingView, StateView } from '@/components/ui/state-view';
import {
  pendingCounts,
  useStudentSurveys,
  type GeneralSurveyItem,
  type PendingSurveyItem,
} from '@/features/surveys/class-survey';
import { surveyMinutes } from '@/features/surveys/survey-form-logic';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';
import { menuScreenOptions } from '@/features/navigation/app-menu';

type Row =
  | { kind: 'header'; key: string; title: string; subtitle: string }
  | { kind: 'general'; key: string; item: GeneralSurveyItem }
  | { kind: 'class'; key: string; item: PendingSurveyItem };

/** Chưa làm lên trước, trong mỗi nhóm giữ nguyên thứ tự CRM trả về. */
const pendingFirst = <T extends { submitted: boolean }>(list: T[]) =>
  [...list].sort((a, b) => Number(a.submitted) - Number(b.submitted));

/**
 * Khảo sát của học viên — bản mobile của màn /surveys (web) + tab "Phiếu khảo sát" trong chi tiết lớp.
 * Mở từ menu: 2 nhóm "Khảo sát chung" (mỗi người làm 1 lần, không gắn lớp) và "Khảo sát lớp học"
 * xếp liền trong 1 danh sách (web chia 2 tab). Mở từ chi tiết lớp thì truyền `classId` để chỉ hiện
 * phiếu của lớp đó. Tất cả lấy từ 1 lượt gọi `/survey/student/pending` (đã kèm `general[]`).
 */
export default function ClassSurveysScreen() {
  const { classId, className } = useLocalSearchParams<{ classId?: string; className?: string }>();
  const brand = useThemeColor('brand');

  const query = useStudentSurveys();
  const pull = usePullRefresh(() => query.refetch());
  const counts = pendingCounts(query.data);

  const rows = useMemo<Row[]>(() => {
    const classItems = pendingFirst(
      classId ? (query.data?.data ?? []).filter((s) => s.class_id === classId) : (query.data?.data ?? []),
    ).map((item): Row => ({ kind: 'class', key: `c-${item.template_id}-${item.class_id}`, item }));
    if (classId) return classItems;

    const generalItems = pendingFirst(query.data?.general ?? []).map(
      (item): Row => ({ kind: 'general', key: `g-${item.template_id}`, item }),
    );
    const out: Row[] = [];
    if (generalItems.length) {
      out.push({ kind: 'header', key: 'h-general', title: 'Khảo sát chung', subtitle: 'Mỗi phiếu làm 1 lần' }, ...generalItems);
    }
    if (classItems.length) {
      out.push({ kind: 'header', key: 'h-class', title: 'Khảo sát lớp học', subtitle: 'Gửi lại để cập nhật' }, ...classItems);
    }
    return out;
  }, [query.data, classId]);

  const total = rows.filter((r) => r.kind !== 'header').length;
  const pending = classId
    ? rows.filter((r) => r.kind === 'class' && !r.item.submitted).length
    : counts.total;

  const header = (
    <View className="gap-2 pb-1">
      <Text className="text-[13px] text-muted">
        {classId
          ? `Phiếu khảo sát của lớp ${className || ''}`.trim()
          : 'Chia sẻ để Uspeak hiểu bạn hơn và dạy sát với mục tiêu của bạn.'}{' '}
        · {total} phiếu{pending ? ` · ${pending} chưa làm` : ''}
      </Text>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Khảo sát', ...menuScreenOptions }} />
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
          data={rows}
          keyExtractor={(r: Row) => r.key}
          getItemType={(r: Row) => r.kind}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-2" />}
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListEmptyComponent={
            <StateView
              icon="checkmark-circle-outline"
              title="Không có phiếu khảo sát"
              description={
                classId
                  ? 'Lớp này hiện chưa có phiếu khảo sát nào.'
                  : 'Khi Uspeak hoặc giáo viên mở khảo sát mới, phiếu sẽ hiện ở đây.'
              }
            />
          }
          renderItem={({ item: row }) =>
            row.kind === 'header' ? (
              <SectionHeader
                title={row.title}
                subtitle={row.subtitle}
                count={row.key === 'h-general' ? counts.general : counts.class}
              />
            ) : row.kind === 'general' ? (
              <SurveyCard
                item={row.item}
                tag="Khảo sát chung"
                doneHint="bấm để xem lại"
                onPress={() =>
                  router.push({
                    pathname: '/class-surveys/[templateId]',
                    params: { templateId: row.item.template_id, title: row.item.template_title },
                  })
                }
              />
            ) : (
              <SurveyCard
                item={row.item}
                tag={classId ? undefined : row.item.class_code || row.item.class_name}
                doneHint="bấm để xem hoặc sửa"
                onPress={() =>
                  router.push({
                    pathname: '/class-surveys/[templateId]',
                    params: { templateId: row.item.template_id, classId: row.item.class_id, title: row.item.template_title },
                  })
                }
              />
            )
          }
        />
      )}
    </View>
  );
}

function SectionHeader({ title, subtitle, count }: { title: string; subtitle: string; count: number }) {
  return (
    <View className="flex-row items-center gap-2 pt-2">
      <Text className="text-[15px] font-bold text-foreground">{title}</Text>
      {count > 0 ? <Badge label={`${count} cần làm`} tone="warning" /> : null}
      <View className="flex-1" />
      <Text className="text-[11px] text-muted">{subtitle}</Text>
    </View>
  );
}

function SurveyCard({
  item,
  tag,
  doneHint,
  onPress,
}: {
  item: GeneralSurveyItem | PendingSurveyItem;
  tag?: string;
  doneHint: string;
  onPress: () => void;
}) {
  const muted = useThemeColor('muted');
  return (
    <Pressable
      onPress={onPress}
      className={`gap-2 rounded-2xl border bg-surface p-3.5 active:bg-surface-muted ${item.submitted ? 'border-border' : 'border-brand'}`}>
      <View className="flex-row items-center gap-2">
        <Badge label={item.submitted ? 'Đã gửi' : 'Chưa làm'} tone={item.submitted ? 'success' : 'warning'} />
        {tag ? <Badge label={tag} tone="brand" /> : null}
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

      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <View className="flex-row items-center gap-1.5">
          <Ionicons name="list-outline" size={13} color={muted} />
          <Text className="text-[11px] text-muted">
            {item.field_count} câu · khoảng {surveyMinutes(item.template_fields, item.template_description)} phút
          </Text>
        </View>
        {item.submitted ? (
          <Text className="text-[11px] text-success">
            {item.submitted_at ? `Gửi lúc ${formatDateTime(item.submitted_at)} · ` : ''}
            {doneHint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
