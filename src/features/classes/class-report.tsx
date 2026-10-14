import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { isNoGrading, type StudentAssignmentItem } from '@/features/assignments/api';
import { assignmentScore10, formatScore } from '@/features/dashboard/student-metrics';
import { useThemeColor } from '@/theme/use-theme-color';

import { summarizeAttendance, type AttendanceSession } from './api';

/**
 * Tab "Báo cáo" của học viên trong chi tiết lớp — port công thức từ uspeak-class-fe
 * my-classes/[classId]/page.tsx (computeAssignmentStats + DashboardTab). Số ở app phải khớp web,
 * nên sửa luật thì sửa cả hai bên.
 *
 * Web vẽ radar + bar chart bằng recharts; trên điện thoại gọn hơn: 4 thẻ số + thanh ngang,
 * không kéo thêm thư viện biểu đồ.
 */

type SubmissionStatus = 'submitted' | 'claimed' | 'waiting_review' | 'completed' | 'redo_requested' | (string & {});

const status = (a: StudentAssignmentItem) => (a.submission?.status ?? '') as SubmissionStatus;

export function computeClassReport(assignments: StudentAssignmentItem[]) {
  const total = assignments.length;
  // Bài không cần chấm đứng riêng: gộp vào "Đã nhận xét" là nói sai (không ai chấm),
  // gộp vào "Đã nộp" thì bị đếm hai lần vì status của nó cũng là completed.
  const noGrading = assignments.filter(isNoGrading).length;
  const completed = assignments.filter((a) => !isNoGrading(a) && (a.student_status === 'graded' || status(a) === 'completed')).length;
  const submitted = assignments.filter(
    (a) => !isNoGrading(a) && (a.student_status === 'submitted' || ['submitted', 'claimed', 'waiting_review'].includes(status(a))),
  ).length;
  const late = assignments.filter((a) => a.submission?.is_late === true).length;
  const redo = assignments.filter((a) => status(a) === 'redo_requested').length;
  const notDone = assignments.filter((a) => a.student_status === 'not_submitted' || a.student_status === 'overdue').length;

  const scores = assignments.map((a) => assignmentScore10(a)).filter((v): v is number => typeof v === 'number');
  const averageScore = scores.length ? Number((scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(1)) : null;

  // Bài không cần chấm vẫn tính là đã hoàn thành — học viên có nộp, chỉ là không ai chấm.
  const completionRate = total > 0 ? Math.round(((completed + noGrading) / total) * 100) : 0;
  const submissionRate = total > 0 ? Math.round(((completed + noGrading + submitted) / total) * 100) : 0;

  return { total, completed, noGrading, submitted, late, redo, notDone, averageScore, completionRate, submissionRate };
}

export type ClassReport = ReturnType<typeof computeClassReport>;

const scoreTone = (score: number | null) => {
  if (score === null) return { bar: 'bg-surface-muted', text: 'text-muted' };
  if (score >= 8) return { bar: 'bg-success', text: 'text-success' };
  if (score >= 5) return { bar: 'bg-warning', text: 'text-warning' };
  return { bar: 'bg-danger', text: 'text-danger' };
};

export function ClassReportView({
  assignments,
  sessions,
  attendanceRate,
}: {
  assignments: StudentAssignmentItem[];
  sessions: AttendanceSession[];
  /** Chuyên cần lấy từ lớp (CRM) khi lớp chưa có buổi nào được điểm danh trên hệ class. */
  attendanceRate: number | null;
}) {
  const report = computeClassReport(assignments);
  const attendance = summarizeAttendance(sessions);
  const attRate = sessions.length ? attendance.rate : (attendanceRate ?? 0);

  const breakdown = [
    { label: 'Đã nhận xét', value: report.completed, bar: 'bg-success', text: 'text-success' },
    { label: 'Không cần chấm', value: report.noGrading, bar: 'bg-violet', text: 'text-violet' },
    { label: 'Chờ nhận xét', value: report.submitted, bar: 'bg-info', text: 'text-info' },
    { label: 'Nộp trễ', value: report.late, bar: 'bg-warning', text: 'text-warning' },
    { label: 'Yêu cầu làm lại', value: report.redo, bar: 'bg-brand', text: 'text-brand' },
    { label: 'Chưa nộp', value: report.notDone, bar: 'bg-danger', text: 'text-danger' },
  ].filter((row) => row.value > 0);

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap justify-between gap-y-2.5">
        <Kpi icon="book" color="#2563eb" label="Bài tập" value={String(report.total)} />
        <Kpi icon="checkmark-done" color="#059669" label="Hoàn thành" value={`${report.completionRate}%`} />
        <Kpi icon="calendar" color="#7c3aed" label="Đi học" value={`${Math.round(attRate)}%`} />
        <Kpi icon="ribbon" color="#d97706" label="Điểm TB" value={formatScore(report.averageScore)} />
      </View>

      <Card title="Tình trạng bài nộp" icon="pie-chart-outline">
        {breakdown.length ? (
          breakdown.map((row) => (
            <View key={row.label} className="gap-1">
              <View className="flex-row justify-between">
                <Text className="text-[13px] text-muted">{row.label}</Text>
                <Text className={`text-[13px] font-bold ${row.text}`}>{row.value}</Text>
              </View>
              <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <View className={`h-full rounded-full ${row.bar}`} style={{ width: `${(row.value / Math.max(1, report.total)) * 100}%` }} />
              </View>
            </View>
          ))
        ) : (
          <Text className="text-[13px] text-muted">Lớp chưa có bài tập nào.</Text>
        )}
        <Text className="text-[11px] text-muted">
          Đã nộp {report.submissionRate}% · {report.total} bài được giao
        </Text>
      </Card>

      <Card title="Điểm từng bài tập" icon="bar-chart-outline">
        {assignments.length ? (
          assignments.map((a, index) => {
            const score = assignmentScore10(a);
            const tone = scoreTone(score);
            return (
              <View key={a._id} className="gap-1">
                <View className="flex-row items-baseline justify-between gap-2">
                  <Text className="flex-1 text-[13px] text-foreground" numberOfLines={1}>
                    <Text className="font-semibold text-muted">BT {index + 1} · </Text>
                    {a.title}
                  </Text>
                  <Text className={`text-[13px] font-bold ${tone.text}`}>
                    {score === null ? (isNoGrading(a) ? 'Không cần chấm' : '—') : formatScore(score)}
                  </Text>
                </View>
                <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
                  <View className={`h-full rounded-full ${tone.bar}`} style={{ width: `${((score ?? 0) / 10) * 100}%` }} />
                </View>
              </View>
            );
          })
        ) : (
          <Text className="text-[13px] text-muted">Chưa có bài tập nào để tính điểm.</Text>
        )}
      </Card>

      {sessions.length ? (
        <Card title="Điểm danh" icon="people-outline">
          <View className="flex-row justify-between">
            <Text className="text-[13px] text-muted">Tỉ lệ tham gia</Text>
            <Text className="text-[13px] font-bold text-success">{attendance.rate}%</Text>
          </View>
          <View className="flex-row flex-wrap gap-x-4 gap-y-1">
            <Text className="text-[13px] text-muted">
              Có mặt <Text className="font-bold text-success">{attendance.present}</Text>
            </Text>
            <Text className="text-[13px] text-muted">
              Đi trễ <Text className="font-bold text-warning">{attendance.late}</Text>
            </Text>
            <Text className="text-[13px] text-muted">
              Vắng <Text className="font-bold text-danger">{attendance.absent}</Text>
            </Text>
            <Text className="text-[13px] text-muted">
              Có phép <Text className="font-bold text-info">{attendance.excused}</Text>
            </Text>
          </View>
        </Card>
      ) : null}
    </View>
  );
}

function Kpi({ icon, color, label, value }: { icon: keyof typeof Ionicons.glyphMap; color: string; label: string; value: string }) {
  return (
    <View className="w-[48.8%] flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-3">
      <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}22` }}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View>
        <Text className="text-lg font-extrabold text-foreground">{value}</Text>
        <Text className="text-[11px] text-muted">{label}</Text>
      </View>
    </View>
  );
}

function Card({ title, icon, children }: { title: string; icon: keyof typeof Ionicons.glyphMap; children: ReactNode }) {
  const brand = useThemeColor('brand');
  return (
    <View className="gap-2.5 rounded-2xl border border-border bg-surface p-3.5">
      <View className="flex-row items-center gap-2">
        <Ionicons name={icon} size={16} color={brand} />
        <Text className="text-sm font-bold text-foreground">{title}</Text>
      </View>
      {children}
    </View>
  );
}
