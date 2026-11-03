import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useMyPermissionCodes } from '@/features/chat/api';
import { useThemeColor } from '@/theme/use-theme-color';

import { pendingCounts, useStudentSurveys } from './class-survey';

const PERMISSION = 'SURVEY_STUDENT_VIEW';

/**
 * Nhắc học viên còn phiếu khảo sát chưa làm — thay cho chấm đỏ số phiếu trên menu "Khảo sát" của web
 * (sidebar đếm `pending` = chung + theo lớp). Không có phiếu nào thì không vẽ gì.
 * Như web: chỉ hỏi khi có quyền màn Khảo sát; chưa biết quyền (gọi lỗi = null) thì vẫn hỏi.
 */
export function PendingSurveyBanner() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const codes = useMyPermissionCodes();
  const allowed = codes.data === null || (codes.data?.includes(PERMISSION) ?? false);
  const query = useStudentSurveys({ enabled: allowed });
  const counts = pendingCounts(query.data);

  if (!allowed || counts.total <= 0) return null;

  const detail = [counts.general ? `${counts.general} khảo sát chung` : '', counts.class ? `${counts.class} khảo sát lớp học` : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={() => router.push('/class-surveys')}
      className="flex-row items-center gap-3 rounded-2xl border border-brand bg-surface p-3.5 active:bg-surface-muted">
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-brand-soft">
        <Ionicons name="clipboard-outline" size={20} color={brand} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-[14px] font-semibold text-foreground">Bạn có {counts.total} phiếu khảo sát cần làm</Text>
        <Text className="text-[12px] text-muted" numberOfLines={1}>
          {detail || 'Chia sẻ để Uspeak dạy sát với mục tiêu của bạn hơn'}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={muted} />
    </Pressable>
  );
}
