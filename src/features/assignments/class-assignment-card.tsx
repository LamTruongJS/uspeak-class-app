import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { useThemeColor } from '@/theme/use-theme-color';

import { assignmentTypeLabel, type ClassAssignmentItem } from './class-api';
import { plainText } from './api';

/**
 * Thẻ bài tập trong màn chi tiết lớp dạy — số liệu lấy y như cột của web
 * classes/[classId]/AssignmentsTab.tsx (bài nộp / đúng hạn / nộp muộn / chưa nộp).
 * `totalStudents` là sĩ số lớp (stats.total_students) để hiện "đã nộp x/sĩ số".
 */
function sessionBadge(v?: string | null) {
  const t = (v ?? '').trim();
  if (!t || /^buổi$/i.test(t)) return null;
  return /^buổi/i.test(t) ? t : `Buổi ${t}`;
}

export const ClassAssignmentCard = memo(function ClassAssignmentCard({
  item,
  totalStudents,
  expanded,
  overdue,
  onToggle,
  onMore,
}: {
  item: ClassAssignmentItem;
  totalStudents?: number;
  expanded: boolean;
  /** Đã quá hạn nộp — tính ở màn hình (React Compiler cấm Date.now() trong render). */
  overdue: boolean;
  onToggle: () => void;
  /** Nhân sự có quyền nhân bản / xoá → nút ⋯ */
  onMore?: () => void;
}) {
  const muted = useThemeColor('muted');
  const description = expanded ? plainText(item.description) : '';
  const submitted = item.submission_count ?? 0;

  return (
    <Pressable onPress={onToggle} className="gap-2.5 rounded-3xl bg-surface p-3.5 active:opacity-90">
      <View className="flex-row items-start gap-2">
        <View className="flex-1 gap-1.5">
          <Text className="text-[15px] font-semibold leading-5 text-foreground" numberOfLines={expanded ? undefined : 2}>
            {item.title}
          </Text>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Badge label={assignmentTypeLabel(item.assignment_type?.code)} tone="violet" />
            {/* session_number lúc là "5", lúc là cả "Buổi 5", lúc chỉ còn chữ "Buổi " mặc định của web */}
            {sessionBadge(item.session_number) ? <Badge label={sessionBadge(item.session_number)!} tone="info" /> : null}
            {item.is_published ? null : <Badge label="Nháp" tone="neutral" />}
          </View>
        </View>
        {onMore ? (
          <Pressable onPress={onMore} hitSlop={8} accessibilityLabel="Thao tác bài tập" className="h-8 w-8 items-center justify-center rounded-full bg-surface-muted active:opacity-70">
            <Ionicons name="ellipsis-horizontal" size={16} color={muted} />
          </Pressable>
        ) : (
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={muted} />
        )}
      </View>

      <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
        <Text className="text-xs text-muted">
          Đã nộp{' '}
          <Text className="font-bold text-foreground">
            {submitted}
            {totalStudents ? `/${totalStudents}` : ''}
          </Text>
        </Text>
        <Text className="text-xs text-success">
          Đúng hạn <Text className="font-bold">{item.on_time_count ?? 0}</Text>
        </Text>
        {item.late_count ? (
          <Text className="text-xs text-warning">
            Trễ <Text className="font-bold">{item.late_count}</Text>
          </Text>
        ) : null}
        {item.not_submitted_count ? (
          <Text className="text-xs text-danger">
            Chưa nộp <Text className="font-bold">{item.not_submitted_count}</Text>
          </Text>
        ) : null}
      </View>

      <View className="flex-row items-center gap-1.5">
        <Ionicons name="time-outline" size={13} color={muted} />
        <Text className={`text-[11px] ${overdue ? 'font-semibold text-danger' : 'text-muted'}`}>
          Hạn nộp {item.submission_deadline ? formatDate(item.submission_deadline) : '—'}
        </Text>
        {item.grading_deadline ? (
          <Text className="text-[11px] text-muted">· Hạn nhận xét {formatDate(item.grading_deadline)}</Text>
        ) : null}
      </View>

      {expanded && description ? (
        <Text className="text-[13px] leading-5 text-muted" selectable>
          {description}
        </Text>
      ) : null}
    </Pressable>
  );
});
