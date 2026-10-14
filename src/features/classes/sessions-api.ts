import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * Buổi học + điểm danh của lớp (giáo viên / trợ giảng / quản trị) — GET /classes/:id/sessions,
 * class-be chuyển tiếp sang CRM. Kiểu dữ liệu và cách gộp người tham gia copy từ uspeak-class-fe
 * classes/[classId]/AttendanceTab.tsx để app và web ra cùng con số.
 *
 * App chỉ XEM. Sửa điểm danh / lý do vắng / cấu hình Zoom vẫn làm trên web (nút "Quản lý trên web").
 */

export interface SessionParticipant {
  name: string;
  user_email: string;
  user_id?: string | { _id?: string; name?: string; phone?: string } | null;
  phone?: string;
  join_time: string;
  leave_time: string;
  duration: number;
  is_present?: boolean | null;
  attendance_role?: 'student' | 'teacher' | 'assistant' | 'manager' | 'not_in_class' | 'not_in_crm';
  attendance_role_label?: string;
  group_name?: string;
}

export interface AbsentStudent {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  is_present?: boolean | null;
  group_name?: string;
}

export interface ClassSessionItem {
  _id: string;
  topic: string;
  date?: string | null;
  session_number?: number;
  duration_minutes?: number;
  zoom_join_url?: string;
  teacher_id?: string | { _id?: string; name?: string } | null;
  participants: SessionParticipant[];
  enrolled_students?: AbsentStudent[];
  absent_students?: AbsentStudent[];
  stats?: { totalJoin: number; presentCrm: number; notInCrm: number; absent: number; enrolled: number };
}

export interface GroupedParticipant {
  name: string;
  email?: string;
  user_id?: SessionParticipant['user_id'];
  phone: string;
  total_duration: number;
  matched: boolean;
  is_present?: boolean | null;
  attendance_role?: SessionParticipant['attendance_role'];
  attendance_role_label?: string;
  group_name?: string;
}

export const ROLE_LABEL: Record<string, string> = {
  student: 'Học viên',
  teacher: 'Giáo viên',
  assistant: 'Trợ giảng',
  manager: 'Ban quản lý',
  not_in_class: 'Không có trong lớp',
  not_in_crm: 'Không có trong hệ thống',
};

const participantUserId = (p: { user_id?: SessionParticipant['user_id'] }) =>
  typeof p.user_id === 'object' && p.user_id ? p.user_id._id : (p.user_id as string | undefined);

const timeValue = (value?: string) => {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
};

/** Một người vào/ra Zoom nhiều lần → tổng thời gian có mặt, các lần chồng nhau chỉ tính một. */
function mergedDuration(entries: SessionParticipant[]) {
  const intervals = entries
    .map((e) => {
      const start = timeValue(e.join_time);
      const end = timeValue(e.leave_time);
      return start > 0 && end > start ? { start, end } : null;
    })
    .filter((v): v is { start: number; end: number } => !!v);

  if (!intervals.length) return entries.reduce((sum, e) => sum + Math.max(0, e.duration || 0), 0);

  intervals.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const it of intervals) {
    const last = merged[merged.length - 1];
    if (!last || it.start > last.end) merged.push({ ...it });
    else last.end = Math.max(last.end, it.end);
  }
  return Math.round(merged.reduce((sum, it) => sum + (it.end - it.start) / 1000, 0));
}

function compareByGroupThenName(a: { group_name?: string; name?: string }, b: { group_name?: string; name?: string }) {
  if (!a.group_name && b.group_name) return 1;
  if (a.group_name && !b.group_name) return -1;
  const byGroup = (a.group_name || '').localeCompare(b.group_name || '', 'vi', { numeric: true, sensitivity: 'base' });
  if (byGroup !== 0) return byGroup;
  return (a.name || '').localeCompare(b.name || '', 'vi', { sensitivity: 'base' });
}

/**
 * Gộp các lần vào phòng về từng người rồi chia nhóm (y như web):
 * - `present`: khớp người trong CRM và không bị đánh vắng tay
 * - `markedAbsent`: khớp CRM nhưng giáo viên đánh vắng
 * - `outside`: vào phòng nhưng không thuộc lớp
 * - `notInCrm`: không khớp được người nào trong hệ thống
 */
export function groupParticipants(participants: SessionParticipant[]) {
  const map = new Map<string, GroupedParticipant & { entries: SessionParticipant[] }>();

  for (const p of participants) {
    // Gộp theo người: ưu tiên user_id (khớp cách BE gộp), rồi email, cuối cùng tên.
    const pid = participantUserId(p);
    const key = pid ? `uid:${pid}` : p.user_email ? `email:${p.user_email.toLowerCase()}` : `name:${p.name}`;
    const group = map.get(key);
    if (group) {
      group.entries.push(p);
      if (p.user_id && !group.user_id) group.user_id = p.user_id;
      if (p.phone && !group.phone) group.phone = p.phone;
      if (p.is_present !== undefined) group.is_present = p.is_present;
      if (p.attendance_role) {
        group.attendance_role = p.attendance_role;
        group.attendance_role_label = p.attendance_role_label;
      }
      if (p.group_name && !group.group_name) group.group_name = p.group_name;
      group.matched = group.matched || !!p.user_id;
    } else {
      map.set(key, {
        name: p.name,
        email: p.user_email,
        user_id: p.user_id,
        phone: p.phone || '',
        total_duration: p.duration || 0,
        entries: [p],
        matched: !!p.user_id,
        is_present: p.is_present,
        attendance_role: p.attendance_role,
        attendance_role_label: p.attendance_role_label,
        group_name: p.group_name,
      });
    }
  }

  const all = Array.from(map.values()).map((g) => ({ ...g, total_duration: mergedDuration(g.entries) }));
  const inClass = (g: GroupedParticipant) => g.attendance_role !== 'not_in_class' && g.attendance_role !== 'not_in_crm';

  return {
    present: all.filter((g) => g.matched && g.is_present !== false && inClass(g)).sort(compareByGroupThenName),
    markedAbsent: all.filter((g) => g.matched && g.is_present === false && inClass(g)),
    outside: all.filter((g) => g.attendance_role === 'not_in_class'),
    notInCrm: all.filter((g) => !g.matched || g.attendance_role === 'not_in_crm'),
  };
}

/** Danh sách vắng để hiện: học viên BE báo vắng + người bị giáo viên đánh vắng tay. */
export function absentList(session: ClassSessionItem, markedAbsent: GroupedParticipant[]): AbsentStudent[] {
  const byId = new Map<string, AbsentStudent>();
  (session.absent_students ?? []).filter((s) => s.is_present !== true).forEach((s) => byId.set(s._id, s));

  markedAbsent.forEach((g) => {
    const id = participantUserId(g);
    if (!id || byId.has(id)) return;
    byId.set(id, {
      _id: id,
      name: typeof g.user_id === 'object' && g.user_id?.name ? g.user_id.name : g.name,
      email: g.email,
      phone: g.phone || (typeof g.user_id === 'object' ? g.user_id?.phone : '') || '',
      is_present: false,
      group_name: g.group_name,
    });
  });

  return Array.from(byId.values()).sort(compareByGroupThenName);
}

/** Buổi 1 của CRM là buổi khai giảng → buổi N hiển thị là N-1 (luật của web, đừng đổi một bên). */
export function sessionTitle(session: ClassSessionItem, fallbackNumber: number) {
  if (session.session_number === 1) return 'Buổi khai giảng';
  if (session.session_number && session.session_number > 1) return `Buổi ${session.session_number - 1}`;
  return session.topic || `Buổi ${fallbackNumber}`;
}

export function sessionBadge(session: ClassSessionItem, fallbackNumber: number) {
  if (session.session_number === 1) return 'KG';
  if (session.session_number && session.session_number > 1) return String(session.session_number - 1);
  return String(fallbackNumber);
}

export function formatDuration(seconds: number) {
  if (!seconds) return '—';
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} phút`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}

/** Buổi học của lớp, chỉ buổi đã tới giờ (buổi tương lai xem ở Lịch trình) — mới nhất lên đầu. */
export function useClassSessions(classId: string, enabled = true) {
  return useQuery({
    queryKey: ['classes', 'sessions', classId],
    enabled: enabled && !!classId,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get<{ data: ClassSessionItem[] }>(`/classes/${classId}/sessions`);
      const now = Date.now();
      return (res.data.data ?? [])
        .filter((s) => {
          const t = s.date ? new Date(s.date).getTime() : NaN;
          return Number.isFinite(t) && t <= now;
        })
        .sort((a, b) => (b.session_number || 0) - (a.session_number || 0));
    },
  });
}
