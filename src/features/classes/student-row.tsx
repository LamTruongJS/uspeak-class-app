import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { useThemeColor } from '@/theme/use-theme-color';

import type { ClassStudentStats } from './staff-api';

const fmtScore = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(1).replace(/\.0$/, '');

/**
 * Một học viên trong màn chi tiết lớp dạy / nhóm giảng dạy: tiến độ nộp bài, điểm TB, chuyên cần
 * và nút nhắn riêng. Dùng chung để hai màn không lệch cách tính màu / cách hiển thị.
 */
export const StudentRow = memo(
function StudentRow({ s, opening, onMessage }: { s: ClassStudentStats; opening: boolean; onMessage: () => void }) {
  const brand = useThemeColor('brand');
  const rate = Math.round(Math.min(100, Math.max(0, s.completion_rate)));
  const bar = rate >= 80 ? 'bg-success' : rate >= 50 ? 'bg-info' : rate >= 20 ? 'bg-warning' : 'bg-danger';
  const att = s.attendance_stats && s.attendance_stats.total_sessions > 0 ? s.attendance_stats : null;
  return (
    <View className="gap-2.5 rounded-2xl border border-border bg-surface p-3.5">
      <View className="flex-row items-center gap-3">
        <Avatar name={s.name} size={40} />
        <View className="flex-1">
          <Text className="text-[15px] font-semibold text-foreground" numberOfLines={1}>
            {s.name}
          </Text>
          <Text className="text-xs text-muted" numberOfLines={1}>
            {s.phone || s.email || '—'}
          </Text>
        </View>
        <Pressable
          onPress={onMessage}
          disabled={opening}
          hitSlop={6}
          className="h-9 w-9 items-center justify-center rounded-full bg-brand-soft active:opacity-70"
          accessibilityLabel="Nhắn tin">
          {opening ? <ActivityIndicator size="small" color={brand} /> : <Ionicons name="chatbubble" size={16} color={brand} />}
        </Pressable>
      </View>
      <View className="gap-1">
        <View className="flex-row justify-between">
          <Text className="text-xs text-muted">
            Nộp{' '}
            <Text className="font-semibold text-foreground">
              {s.submitted_count}/{s.total_assignments}
            </Text>
            {s.not_submitted_count ? <Text className="font-semibold text-danger"> · {s.not_submitted_count} chưa nộp</Text> : null}
            {s.late_count ? <Text className="font-semibold text-warning"> · {s.late_count} trễ</Text> : null}
          </Text>
          <Text className="text-xs font-bold text-foreground">{rate}%</Text>
        </View>
        <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <View className={`h-full rounded-full ${bar}`} style={{ width: `${rate}%` }} />
        </View>
      </View>
      <View className="flex-row gap-4">
        <Text className="text-xs text-muted">
          Điểm TB <Text className="font-bold text-foreground">{fmtScore(s.average_score)}</Text>
        </Text>
        {att ? (
          <Text className="text-xs text-muted">
            Chuyên cần{' '}
            <Text className={`font-bold ${att.attendance_rate < 75 ? 'text-danger' : 'text-foreground'}`}>
              {att.attended_sessions}/{att.total_sessions} ({Math.round(att.attendance_rate)}%)
            </Text>
          </Text>
        ) : null}
      </View>
    </View>
  );
},
);
