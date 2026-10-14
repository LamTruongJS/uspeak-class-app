import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { addDays, startOfDay } from '@/lib/format';

/**
 * Lịch trình học viên — port từ uspeak-class-fe/src/app/[locale]/(dashboard)/schedule/page.tsx.
 * class-be không trả từng buổi học: chỉ có `class_time` dạng "T246 18h00 - 20h00" + ngày bắt đầu/kết
 * thúc, nên client tự trải ra từng ngày. Bài tập thì là mốc hạn nộp.
 */
export interface ScheduleClassItem {
  _id: string;
  class_id?: string;
  class_time?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  class_name?: string;
  teacher_name?: string;
  zoom_link?: string | null;
  class_code?: string;
}

interface ScheduleAssignmentItem {
  _id: string;
  class_id?: string;
  title?: string;
  class_name?: string;
  submission_deadline?: string | null;
  redo_deadline?: string | null;
  student_status?: string;
}

interface StudentScheduleData {
  upcomingClasses?: ScheduleClassItem[];
  assignments?: ScheduleAssignmentItem[];
  redoAssignments?: ScheduleAssignmentItem[];
}

export type ScheduleEventType = 'class' | 'deadline' | 'redo';

export interface ScheduleEvent {
  id: string;
  type: ScheduleEventType;
  title: string;
  subtitle?: string;
  /** Thời điểm bắt đầu (lớp) hoặc hạn nộp (bài tập) */
  start: Date;
  /** Chỉ có với buổi học */
  end?: Date;
  classCode?: string;
  /** Để tra tên hiển thị của lớp (display_name) — class_name của lịch là tên nội bộ CRM "EET22 - 05h00 T246 - 160926" */
  classId?: string;
  zoomLink?: string | null;
  assignmentId?: string;
  /** Hạn nộp mà bài đã nộp rồi → hiện mờ + "Đã nộp", không báo đỏ */
  done?: boolean;
}

export function useStudentSchedule() {
  return useQuery({
    queryKey: ['schedule', 'student'],
    queryFn: async () => {
      // Endpoint trả lúc `{ data: {...} }` lúc thẳng `{...}` — web cũng phải đỡ cả hai.
      const res = await api.get<StudentScheduleData | { data?: StudentScheduleData }>('/assignments/schedule');
      const raw = res.data;
      return ((raw && 'data' in raw ? raw.data : raw) ?? {}) as StudentScheduleData;
    },
  });
}

/** "T246 18h00 - 20h00" → thứ (0=CN) + giờ. "TCN" / "T7CN" cũng được. */
export function parseClassTime(ct?: string | null) {
  if (!ct) return null;
  const m = ct.match(/T([\dCN]+)\s+(\d{1,2})h(\d{2})(?:\s*-\s*(\d{1,2})h(\d{2}))?/);
  if (!m) return null;
  const days: number[] = [];
  for (const ch of m[1]) {
    const n = parseInt(ch, 10);
    if (!Number.isNaN(n)) days.push(n - 1); // T2 → 1 (thứ hai trong Date.getDay)
  }
  if (m[1].includes('CN')) days.push(0);
  const startH = parseInt(m[2], 10);
  const startM = parseInt(m[3], 10);
  return {
    days,
    startH,
    startM,
    endH: m[4] ? parseInt(m[4], 10) : startH + 2,
    endM: m[5] ? parseInt(m[5], 10) : startM,
  };
}

/** student_status của /assignments/schedule còn phải làm (BE thêm urgent < 24h, upcoming < 3 ngày) */
const PENDING = ['not_submitted', 'overdue', 'urgent', 'upcoming', 'redo_requested'];

/**
 * Lớp chưa đặt tên hiển thị thì class_name là tên nội bộ "PRO01 - 18h00 T2 - 050326" (mã · giờ · ngày khai giảng)
 * → chỉ giữ mã lớp, phần giờ đã có ở cột giờ của lịch.
 */
export function shortClassName(name: string, code?: string) {
  if (code && name.startsWith(code) && /\d{1,2}h\d{2}/.test(name)) return code;
  return name;
}

export interface EventFilters {
  classes: boolean;
  deadlines: boolean;
  redo: boolean;
}

/** Trải dữ liệu lịch ra sự kiện trong khoảng [from, to] (tính theo ngày). */
export function buildEvents(
  data: StudentScheduleData | undefined,
  from: Date,
  to: Date,
  filters: EventFilters = { classes: true, deadlines: true, redo: true },
): ScheduleEvent[] {
  if (!data) return [];
  const rangeStart = startOfDay(from);
  const rangeEnd = startOfDay(to);
  rangeEnd.setHours(23, 59, 59, 999);
  const events: ScheduleEvent[] = [];

  if (filters.classes) {
    for (const cls of data.upcomingClasses ?? []) {
      const p = parseClassTime(cls.class_time);
      if (!p) continue;
      const classStart = cls.start_date ? startOfDay(new Date(cls.start_date)) : new Date(0);
      const classEnd = cls.end_date ? new Date(cls.end_date) : new Date(2099, 0);
      classEnd.setHours(23, 59, 59, 999);
      for (let d = new Date(rangeStart); d <= rangeEnd; d = addDays(d, 1)) {
        if (d < classStart || d > classEnd || !p.days.includes(d.getDay())) continue;
        const start = new Date(d);
        start.setHours(p.startH, p.startM, 0, 0);
        const end = new Date(d);
        end.setHours(p.endH, p.endM, 0, 0);
        events.push({
          id: `c-${cls._id}-${d.getTime()}`,
          type: 'class',
          title: cls.class_name || 'Lớp học',
          subtitle: cls.teacher_name ? `GV ${cls.teacher_name}` : undefined,
          start,
          end,
          classCode: cls.class_code,
          classId: cls._id,
          zoomLink: cls.zoom_link,
        });
      }
    }
  }

  const pushDeadline = (a: ScheduleAssignmentItem, type: 'deadline' | 'redo', when?: string | null) => {
    if (!when) return;
    const d = new Date(when);
    if (Number.isNaN(d.getTime()) || d < rangeStart || d > rangeEnd) return;
    events.push({
      id: `${type}-${a._id}`,
      type,
      title: a.title || (type === 'redo' ? 'Bài cần làm lại' : 'Bài tập'),
      subtitle: type === 'redo' ? 'Cần làm lại' : a.class_name,
      start: d,
      assignmentId: a._id,
      classId: a.class_id,
      done: type === 'deadline' && !!a.student_status && !PENDING.includes(a.student_status),
    });
  };

  if (filters.deadlines) {
    for (const a of data.assignments ?? []) pushDeadline(a, 'deadline', a.submission_deadline);
  }
  if (filters.redo) {
    const redo = data.redoAssignments ?? (data.assignments ?? []).filter((a) => a.student_status === 'redo_requested');
    for (const a of redo) pushDeadline(a, 'redo', a.redo_deadline || a.submission_deadline);
  }

  return events.sort((a, b) => a.start.getTime() - b.start.getTime());
}
