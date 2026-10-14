import { Ionicons } from '@expo/vector-icons';
import { memo, type ComponentProps } from 'react';
import { Text, View } from 'react-native';

import { ProgressRing } from '@/components/ui/progress-ring';
import { WEEKDAY_SHORT } from '@/lib/format';
import { useThemeColor, type ThemeColor } from '@/theme/use-theme-color';

import { summarizeAttendance, type AttendanceSession, type AttendanceStatus } from './api';

/** Tab Điểm danh của học viên: vòng tỉ lệ + dải chấm từng buổi + danh sách buổi dạng nhóm liền khối. */

const VIEW: Record<AttendanceStatus, { label: string; color: ThemeColor; dot: string; icon: ComponentProps<typeof Ionicons>['name'] }> = {
  present: { label: 'Có mặt', color: 'success', dot: 'bg-success', icon: 'checkmark-circle' },
  late: { label: 'Đi trễ', color: 'warning', dot: 'bg-warning', icon: 'time' },
  absent: { label: 'Vắng', color: 'danger', dot: 'bg-danger', icon: 'close-circle' },
  excused: { label: 'Có phép', color: 'info', dot: 'bg-info', icon: 'document-text' },
  upcoming: { label: 'Sắp tới', color: 'muted', dot: 'bg-muted', icon: 'ellipse-outline' },
};

/** `sessions` xếp mới → cũ (như danh sách); dải chấm thì vẽ cũ → mới cho đúng chiều thời gian. */
export function AttendanceOverview({ sessions }: { sessions: AttendanceSession[] }) {
  const s = summarizeAttendance(sessions);
  if (!sessions.length) return null;
  const legend: { status: AttendanceStatus; value: number }[] = [
    { status: 'present', value: s.present },
    { status: 'late', value: s.late },
    { status: 'absent', value: s.absent },
    { status: 'excused', value: s.excused },
  ];

  return (
    <View className="gap-4 rounded-3xl border border-border bg-surface p-4">
      <View className="flex-row items-center gap-4">
        <ProgressRing percent={s.rate} size={76} stroke={7} color={s.rate < 75 ? 'warning' : 'success'}>
          <Text className="text-[17px] font-extrabold text-foreground">{s.rate}%</Text>
        </ProgressRing>
        <View className="flex-1 gap-2">
          <Text className="text-[15px] font-bold text-foreground">Tỉ lệ tham gia</Text>
          <View className="flex-row flex-wrap gap-x-4 gap-y-1.5">
            {legend.map((l) => (
              <View key={l.status} className="flex-row items-center gap-1.5">
                <View className={`h-2 w-2 rounded-full ${VIEW[l.status].dot}`} />
                <Text className="text-[12.5px] text-muted">
                  {VIEW[l.status].label} <Text className="font-bold text-foreground">{l.value}</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View className="gap-1.5">
        <View className="flex-row flex-wrap gap-1">
          {[...sessions].reverse().map((x) => (
            <View key={`${x.session_number}-${x.date}`} className={`h-3 w-3 rounded-[4px] ${VIEW[x.status]?.dot ?? 'bg-muted'}`} />
          ))}
        </View>
        <Text className="text-[11px] text-muted">{s.completed} buổi đã học · từ cũ đến mới</Text>
      </View>
    </View>
  );
}

/** Một buổi trong danh sách liền khối — `first`/`last` để bo góc đầu/cuối nhóm. */
export const AttendanceRow = memo(function AttendanceRow({
  session,
  first,
  last,
}: {
  session: AttendanceSession;
  first: boolean;
  last: boolean;
}) {
  const view = VIEW[session.status] ?? VIEW.upcoming;
  const color = useThemeColor(view.color);
  const d = new Date(session.date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  // CRM đánh số từ buổi khai giảng: buổi 1 = khai giảng, buổi N hiển thị là N-1 (giống sessionTitle bên giáo viên)
  const label = session.session_number === 1 ? 'Buổi khai giảng' : `Buổi ${session.session_number - 1}`;

  return (
    <View
      className={`flex-row items-center gap-3.5 border-x border-border bg-surface px-4 py-3 ${first ? 'rounded-t-3xl border-t pt-4' : ''} ${
        last ? 'rounded-b-3xl border-b pb-4' : ''
      }`}>
      <View className="w-11 items-center">
        <Text className="text-[11px] font-semibold text-muted">{WEEKDAY_SHORT[d.getDay()]}</Text>
        <Text className="text-[17px] font-extrabold leading-6 text-foreground">{dd}</Text>
        <Text className="text-[10.5px] text-muted">th{mm}</Text>
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-[14.5px] font-semibold leading-5 text-foreground" numberOfLines={2}>
          {session.topic || label}
        </Text>
        {/* Tên buổi thường đã có sẵn "Buổi N" → khỏi lặp lại dòng phụ */}
        {session.topic && !session.topic.toLowerCase().includes(label.toLowerCase()) ? (
          <Text className="text-[12px] text-muted">{label}</Text>
        ) : null}
      </View>
      <View className="items-center gap-0.5">
        <Ionicons name={view.icon} size={20} color={color} />
        <Text className="text-[11px] font-semibold" style={{ color }}>
          {view.label}
        </Text>
      </View>
      {!last ? <View className="absolute bottom-0 left-[76px] right-4 h-px bg-border" /> : null}
    </View>
  );
});
