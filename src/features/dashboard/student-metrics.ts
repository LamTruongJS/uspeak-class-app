import type { StudentAssignmentItem } from '@/features/assignments/api';
import type { StudentClassItem } from '@/features/classes/api';
import type { ScheduleClassItem } from '@/features/schedule/api';

/**
 * Công thức dashboard học viên — port NGUYÊN từ uspeak-class-fe
 * src/app/[locale]/(dashboard)/dashboard/StudentDashboard.tsx để số trên app khớp số trên web.
 * Sửa luật ở đây thì sửa cả bên web.
 */

export const isZoomClass = (c: StudentClassItem) => String(c.course_type || '').toLowerCase() === 'zoom';
/** Lớp tự đóng học phí (không phải lớp nhận từ combo / quà tặng / chuyển lớp) */
export const isDirectTuitionClass = (c: StudentClassItem) => !c.from_combo_id && !c.is_gift_class_id && !c.is_from_class_id;
export const isLearningClass = (c: StudentClassItem) => Number(c.progress || 0) < 100;
export const classDisplayName = (c: StudentClassItem) => c.display_name?.trim() || c.class_name;

export function formatMoney(value?: number | null, compact = false) {
  const amount = Number(value || 0);
  if (compact && amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  return `${amount.toLocaleString('vi-VN')}đ`;
}

export function formatScore(value: number | null) {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toFixed(1).replace(/\.0$/, '');
}

export function gradeLabel(score: number | null) {
  if (score === null) return 'Chưa có điểm';
  if (score >= 8) return 'Giỏi';
  if (score >= 6.5) return 'Khá';
  if (score >= 5) return 'Trung bình';
  return 'Cần cải thiện';
}

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

export function formatDeadline(dateStr: string | null | undefined, now: number): { text: string; overdue: boolean } {
  if (!dateStr) return { text: 'Không có hạn', overdue: false };
  const deadline = new Date(dateStr);
  const diff = deadline.getTime() - now;
  if (diff < 0) return { text: `Quá hạn ${Math.max(1, Math.ceil(-diff / DAY_MS))} ngày`, overdue: true };
  const days = Math.floor(diff / DAY_MS);
  const hours = Math.floor((diff % DAY_MS) / 3_600_000);
  if (days === 0) return { text: `Hạn: hôm nay ${pad(deadline.getHours())}:${pad(deadline.getMinutes())}`, overdue: false };
  if (days <= 3) return { text: `Còn ${days} ngày ${hours} giờ`, overdue: false };
  return { text: `Hạn: ${pad(deadline.getDate())}/${pad(deadline.getMonth() + 1)}`, overdue: false };
}

/** Điểm quy về thang 10. Bài không cần chấm → null (không thì kéo tụt điểm TB). */
export function assignmentScore10(item: StudentAssignmentItem): number | null {
  if (item.requires_grading === false || item.submission?.grading_exempt === true) return null;
  const score = item.submission?.score;
  const max = item.submission?.max_score;
  if (typeof score !== 'number') return null;
  if (typeof max === 'number' && max > 0 && max !== 10) return (score / max) * 10;
  return score;
}

export function average(values: (number | null)[]) {
  const nums = values.filter((v): v is number => typeof v === 'number');
  return nums.length ? nums.reduce((s, v) => s + v, 0) / nums.length : null;
}

export interface ClassRisk {
  classId: string;
  className: string;
  score: number;
  level: 'high' | 'medium' | 'low';
  reasons: string[];
}

export function classRisk(cls: StudentClassItem, assignments: StudentAssignmentItem[]): ClassRisk {
  const own = assignments.filter((a) => a.class_id === cls._id);
  const notSubmitted = own.filter((a) => a.student_status === 'not_submitted').length;
  const overdue = own.filter((a) => a.student_status === 'overdue').length;
  const missing = own.length > 0 ? notSubmitted : Number(cls.pending_assignments || 0);

  const att = isZoomClass(cls) ? cls.attendance_stats : null;
  const total = Math.max(0, Number(att?.total_sessions || 0));
  const attended = Math.max(0, Number(att?.attended_sessions || 0));
  const rate = total > 0 && typeof att?.attendance_rate === 'number' ? att.attendance_rate : null;
  const absent = total > 0 ? Math.max(0, total - attended) : 0;

  let score = missing * 2 + overdue * 3 + absent * 2;
  if (rate !== null && rate < 75) score += 4;
  if (rate !== null && rate < 60) score += 3;

  const reasons: string[] = [];
  if (absent > 0) reasons.push(`${absent} buổi vắng`);
  if (rate !== null && rate < 75) reasons.push(`đi học ${Math.round(rate)}%`);
  if (missing > 0) reasons.push(`${missing} bài chưa nộp`);
  if (overdue > 0) reasons.push(`${overdue} bài quá hạn`);

  return { classId: cls._id, className: classDisplayName(cls), score, level: score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low', reasons };
}

export function learningMetrics(classes: StudentClassItem[], assignments: StudentAssignmentItem[]) {
  const fromClasses = classes.reduce(
    (acc, c) => ({ completed: acc.completed + Number(c.completed_assignments || 0), total: acc.total + Number(c.total_assignments || 0) }),
    { completed: 0, total: 0 },
  );
  const submitted = assignments.filter((a) => ['submitted', 'late', 'graded'].includes(a.student_status)).length;
  const assignmentCompleted = assignments.length > 0 ? submitted : fromClasses.completed;
  const assignmentTotal = assignments.length > 0 ? assignments.length : fromClasses.total;
  const assignmentRate = assignmentTotal > 0 ? Math.round((assignmentCompleted / assignmentTotal) * 100) : null;

  const att = classes.filter(isZoomClass).reduce(
    (acc, c) => ({
      attended: acc.attended + Number(c.attendance_stats?.attended_sessions || 0),
      total: acc.total + Number(c.attendance_stats?.total_sessions || 0),
    }),
    { attended: 0, total: 0 },
  );
  const attendanceRate = att.total > 0 ? Math.round((att.attended / att.total) * 100) : null;

  const rates = [assignmentRate, attendanceRate].filter((r): r is number => typeof r === 'number');
  const learningIndex = rates.length ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length) : 0;

  return { assignmentCompleted, assignmentTotal, attendedSessions: att.attended, totalSessions: att.total, attendanceRate, learningIndex };
}

const scheduleClassId = (s: ScheduleClassItem) => s.class_id || s._id;

/** Buổi học sắp tới gần nhất của lớp Zoom còn đang học. */
export function nextClass(schedule: ScheduleClassItem[] | undefined, classes: StudentClassItem[]) {
  const zoomIds = new Set(classes.filter((c) => isLearningClass(c) && isZoomClass(c)).map((c) => c._id));
  const time = (
    s: ScheduleClassItem & { start_time?: string | null; start_at?: string | null; session_date?: string | null; date?: string | null },
  ) => {
    const v = s.start_time || s.start_at || s.session_date || s.date;
    const t = v ? new Date(v).getTime() : NaN;
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
  };
  const item = (schedule ?? []).filter((s) => zoomIds.has(scheduleClassId(s))).sort((a, b) => time(a) - time(b))[0];
  if (!item) return null;
  return { item, cls: classes.find((c) => c._id === scheduleClassId(item)) ?? null };
}
