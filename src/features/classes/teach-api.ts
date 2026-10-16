import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

import type { ClassDetailStats, ClassStudentStats, ClassStatus } from './staff-api';

/**
 * Các màn giảng dạy còn lại của web, bản mobile chỉ xem:
 * - Đang trực tuyến      GET /chat/presence
 * - Nhóm giảng dạy       GET /classes/my-teaching-groups · GET /classes/teaching-groups/:id/detail
 * - Bảng điểm            GET /assignments/gradebook/:classId
 * - Theo dõi học viên PRO GET /pro-tracking/packages · /pro-tracking/packages/:comboId/students
 */

// ─── Đang trực tuyến ────────────────────────────────────────────────────────

export interface PresenceUser {
  _id: string;
  full_name: string;
  email: string;
  role: string;
  avatar_url: string | null;
  is_online: boolean;
  last_seen_at: string | null;
}

interface PresenceResponse {
  data: PresenceUser[];
  summary: { total: number; online: number; offline: number };
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const ROLE_NAME: Record<string, string> = {
  AD: 'Quản trị',
  TE: 'Giáo viên',
  TA: 'Trợ giảng',
  TG: 'Người nhận xét',
  ST: 'Học viên',
};

/**
 * Trạng thái online/offline. Web vừa poll vừa nghe socket `presence_update`; app chỉ poll 30s
 * (giống nhịp poll của web) cho đơn giản — màn này mở ít và không cần chính xác tới từng giây.
 */
export function usePresence(params: { search?: string; role?: string; page?: number }) {
  return useQuery({
    queryKey: ['presence', params.search ?? '', params.role ?? '', params.page ?? 1],
    refetchInterval: 30_000,
    staleTime: 20_000,
    queryFn: async () =>
      (
        await api.get<PresenceResponse>('/chat/presence', {
          params: { search: params.search || undefined, role: params.role || undefined, page: params.page ?? 1, limit: 50 },
        })
      ).data,
  });
}

// ─── Nhóm giảng dạy ─────────────────────────────────────────────────────────

export interface TeachingGroupItem {
  _id: string;
  group_name: string;
  assistant: { _id: string; name: string; email?: string; avatar?: string };
  student_ids: { _id: string; name: string }[];
  max_students: number;
  class_id: string;
  class_name: string;
  class_code: string;
  status_class: ClassStatus;
  course_type: 'zoom' | 'elearning' | 'combo';
  teacher: { _id: string; name: string } | null;
  start_date: string;
  end_date: string | null;
  cover_image: string | null;
}

export interface TeachingGroupDetail {
  group_id: string;
  group_name: string;
  max_students: number;
  assistant: { _id: string; name: string; email?: string; avatar?: string } | null;
  class_id: string;
  class_name: string;
  class_code: string;
  status_class: ClassStatus;
  course_type?: 'zoom' | 'elearning' | 'combo';
  start_date?: string;
  end_date?: string | null;
  teacher: { _id: string; name: string; avatar?: string } | null;
  stats: ClassDetailStats;
  students: ClassStudentStats[];
}

export function useMyTeachingGroups() {
  return useQuery({
    queryKey: ['teaching-groups', 'mine'],
    staleTime: 2 * 60_000,
    queryFn: async () => (await api.get<{ data: TeachingGroupItem[]; total: number }>('/classes/my-teaching-groups')).data.data ?? [],
  });
}

export function useTeachingGroupDetail(groupId: string) {
  return useQuery({
    queryKey: ['teaching-groups', 'detail', groupId],
    enabled: !!groupId,
    staleTime: 60_000,
    queryFn: async () => (await api.get<TeachingGroupDetail>(`/classes/teaching-groups/${groupId}/detail`)).data,
  });
}

/**
 * Phạm vi NHÓM cho các màn của lớp (Điểm danh, Bài nộp, Bảng điểm, Báo cáo, Học viên) khi mở từ trang
 * nhóm giảng dạy với `?group=<groupId>`: `ids` = học viên của nhóm (null = không lọc, xem cả lớp).
 */
export function useGroupScope(groupId?: string) {
  const detail = useTeachingGroupDetail(groupId ?? '');
  const students = detail.data?.students;
  const ids = useMemo(() => (groupId && students ? new Set(students.map((s) => s._id)) : null), [groupId, students]);
  return {
    active: !!groupId,
    /** Đang ở chế độ nhóm nhưng chưa tải xong danh sách học viên nhóm */
    pending: !!groupId && !students,
    ids,
    name: detail.data?.group_name,
    detail,
  };
}

// ─── Bảng điểm ──────────────────────────────────────────────────────────────

export interface GradebookData {
  assignments: { _id: string; title: string; maxScore: number; requires_grading?: boolean }[];
  students: {
    student_id: string;
    student_name: string;
    scores: Record<
      string,
      {
        score: number | null;
        status: string;
        maxScore: number;
        requiresGrading?: boolean;
        /** HV được miễn nhận xét ở lớp này → ô điểm để trống, KHÔNG tính vào điểm TB */
        gradingExempt?: boolean;
      }
    >;
  }[];
}

export function useGradebook(classId: string) {
  return useQuery({
    queryKey: ['gradebook', classId],
    enabled: !!classId,
    staleTime: 60_000,
    queryFn: async () => (await api.get<{ data: GradebookData }>(`/assignments/gradebook/${classId}`)).data.data,
  });
}

export type GradebookAssignment = GradebookData['assignments'][number];
export type GradebookStudent = GradebookData['students'][number];
export type GradebookCell = GradebookStudent['scores'][string];

/**
 * Luật bảng điểm — copy y từ uspeak-class-fe src/utils/gradebook.ts (nguồn chung của web: trang Bảng điểm +
 * tab Bảng điểm trong chi tiết lớp). Sửa luật thì sửa cả hai bên.
 *
 * Cột hiển thị: bài cần chấm + bài không cần chấm nhưng đã có ai có điểm.
 */
export function visibleAssignments(data: GradebookData) {
  return data.assignments.filter(
    (a) => a.requires_grading !== false || data.students.some((st) => typeof st.scores?.[a._id]?.score === 'number'),
  );
}

const noGrading = (cell: GradebookCell | undefined, a: GradebookAssignment) =>
  (cell?.requiresGrading ?? a.requires_grading) === false || cell?.gradingExempt === true;

/**
 * Ô có tính vào điểm TB không — CHỈ bài đã nộp VÀ đã có điểm: chưa nộp → bỏ qua (không tính 0, việc thiếu bài
 * xem ở số bài chưa nộp); không cần chấm / đang chờ chấm → bỏ qua.
 */
function countsTowardAverage(cell: GradebookCell | undefined, a: GradebookAssignment) {
  if (!cell || cell.status === 'not_submitted') return false;
  if (noGrading(cell, a)) return false;
  return typeof cell.score === 'number';
}

/** Điểm TB 1 học viên (thang 10, cộng điểm thô như web) — null khi chưa có bài nào được tính. */
export function studentAverage(st: GradebookStudent, gradingAssignments: GradebookAssignment[]) {
  const counted = gradingAssignments.filter((a) => countsTowardAverage(st.scores?.[a._id], a));
  if (!counted.length) return null;
  return counted.reduce((sum, a) => sum + (st.scores?.[a._id]?.score || 0), 0) / counted.length;
}

export type CellTone = 'empty' | 'none' | 'pending' | 'great' | 'good' | 'fair' | 'low';

const STATUS_SHORT: Record<string, string> = {
  submitted: 'Chờ NX',
  claimed: 'Đang NX',
  waiting_review: 'Chờ duyệt',
  completed: '',
  timeout: 'Hết giờ',
  redo_requested: 'Làm lại',
  regrade_requested: 'NX lại',
  reassigned: 'Chuyển giao',
  not_submitted: '—',
};

/** Nhãn + tông màu của 1 ô (getCellLabel / getCellBg của web). */
export function cellView(cell: GradebookCell | undefined, a: GradebookAssignment): { label: string; tone: CellTone } {
  const status = cell?.status || 'not_submitted';
  if (status === 'not_submitted') return { label: '—', tone: 'empty' };
  if (noGrading(cell, a)) return { label: 'Không chấm', tone: 'none' };
  if (typeof cell?.score !== 'number') return { label: STATUS_SHORT[status] || 'Chờ', tone: 'pending' };
  const max = cell.maxScore || 10;
  const pct = max > 0 ? (cell.score / max) * 100 : 0;
  return { label: String(cell.score), tone: pct >= 90 ? 'great' : pct >= 75 ? 'good' : pct >= 60 ? 'fair' : 'low' };
}

// ─── Theo dõi học viên PRO ──────────────────────────────────────────────────
// Kiểu copy từ uspeak-class-fe src/stores/pro-tracking/types.ts.

export interface ProPackage {
  _id: string;
  class_code: string;
  class_name: string;
  price: number;
  /** Số khoá = số nhóm được phép đăng ký + số lớp tự động tham gia */
  total_classes: number;
  total_students: number;
}

export interface ProStudentSummary {
  total_classes: number;
  completed: number;
  studying: number;
  registered: number;
  not_registered: number;
  progress_rate: number;
  average_score: number | null;
  total_assignments: number;
  attendance_rate: number | null;
  attended_sessions: number;
  total_sessions: number;
  total_value: number;
  completed_value: number;
}

export interface ProStudentListItem {
  student_id: string;
  student_name: string;
  email: string;
  phone: string;
  avatar: string | null;
  joined_package_at: string | null;
  summary: ProStudentSummary;
}

export function useProPackages() {
  return useQuery({
    queryKey: ['pro-tracking', 'packages'],
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<{ data: ProPackage[] }>('/pro-tracking/packages')).data.data ?? [],
  });
}

/**
 * Học viên trong một gói PRO. Mặc định BE trả bản NHẸ (thiếu điểm TB / tỉ lệ đi học) cho nhanh;
 * app xin `full: true` vì màn này hiện cả hai số đó.
 */
export function useProStudents(comboId: string, search: string) {
  return useQuery({
    queryKey: ['pro-tracking', 'students', comboId, search],
    enabled: !!comboId,
    staleTime: 60_000,
    queryFn: async () =>
      (
        await api.get<{
          data: {
            package: { _id: string; class_code: string; class_name: string };
            students: ProStudentListItem[];
            pagination: { page: number; limit: number; total: number; total_pages: number };
          };
        }>(`/pro-tracking/packages/${comboId}/students`, {
          params: { search: search || undefined, page: 1, limit: 100, full: true },
        })
      ).data.data,
  });
}
