import { Text, View } from 'react-native';

import { Badge } from '@/components/ui/badge';
import type { SymStudentProgress } from '@/features/classes/class-admin-api';
import { formatDateTime } from '@/lib/format';

/**
 * Tiến độ Speak Your Mind của MỘT học viên, nhìn từ phía nhân sự — bản mobile của `SymProgressCell`
 * trong web classes/[classId]/SubmissionBreakdownModal.tsx (cùng nhãn "Xong · x%" / "Chưa đạt · cao nhất x%"
 * / "Đã làm x/y câu"). Bài SYM không có nộp/chấm: xong = làm hết bài nghe đúng TRÊN `passScore`.
 */
export function SymStaffProgress({
  progress,
  total,
  passScore,
}: {
  progress?: SymStudentProgress | null;
  total: number;
  passScore?: number;
}) {
  if (!progress) return <Text className="text-[12.5px] text-muted">Chưa làm</Text>;
  const done = progress.status === 'completed';
  const count = progress.total || total;
  const label = done
    ? `Xong · ${progress.score}%`
    : progress.needs_retry
      ? `Chưa đạt · cao nhất ${progress.score}%`
      : `Đã làm ${progress.done}/${count} câu`;
  const pct = Math.max(0, Math.min(100, progress.percent));
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-[13px] font-semibold text-foreground" numberOfLines={1}>
          {label}
        </Text>
        <Text className={`text-[13px] font-bold ${done ? 'text-success' : 'text-brand'}`}>{pct}%</Text>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <View className={`h-full rounded-full ${done ? 'bg-success' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
      </View>
      <View className="flex-row flex-wrap items-center gap-1.5">
        {done ? (
          <Badge label="Hoàn thành" tone="success" />
        ) : progress.needs_retry ? (
          <Badge label="Cần làm lại" tone="warning" />
        ) : (
          <Badge label="Đang làm" tone="info" />
        )}
        {progress.is_late ? <Badge label="Trễ" tone="warning" /> : null}
        <Text className="text-[11.5px] text-muted">
          {progress.done}/{count} câu
          {passScore != null ? ` · cao nhất ${progress.score}% (cần > ${passScore}%)` : ''}
        </Text>
      </View>
      <Text className="text-[11.5px] text-muted">
        {progress.attempts} lần làm xong
        {progress.completed_at ? ` · xong lúc ${formatDateTime(progress.completed_at)}` : ''}
        {!progress.completed_at && progress.last_activity_at ? ` · ${formatDateTime(progress.last_activity_at)}` : ''}
      </Text>
    </View>
  );
}
