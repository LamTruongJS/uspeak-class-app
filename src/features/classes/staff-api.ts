import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * Lớp dạy cho giáo viên / trợ giảng / quản trị — copy kiểu từ uspeak-class-fe
 * src/stores/class/types.ts (ClassItem, ClassDetailResponse), bỏ field app chưa dùng.
 */
export type ClassStatus = 'OPEN_REGISTRATION' | 'CLOSED_REGISTRATION' | 'IN_PROGRESS' | 'ENDED';

export interface StaffClassItem {
  _id: string;
  class_code: string;
  class_name: string;
  display_name?: string;
  course_type: 'zoom' | 'elearning' | 'combo';
  status_class: ClassStatus;
  start_date: string;
  end_date: string | null;
  class_time: string | null;
  teacher: { _id: string; name: string; avatar?: string } | null;
  managers?: string[];
  max_students: number | null;
  active_students: number;
  class_image?: string | null;
  assignment_count?: number;
  /** Phòng Zoom cố định của lớp — mặc định khi tạo buổi học mới (chỉ GET /classes của nhân sự mới có). */
  zoom_id?: string;
  zoom_pass?: string;
  zoom_key_id?: string | null;
}

export interface ClassStudentStats {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  total_assignments: number;
  submitted_count: number;
  completed_count: number;
  completion_rate: number;
  average_score: number | null;
  late_count: number;
  not_submitted_count: number;
  attendance_stats?: { total_sessions: number; attended_sessions: number; attendance_rate: number };
  /** false = tài khoản đang bị khoá (CRM) */
  isActive?: boolean;
  avatar?: string;
  on_time_count?: number;
  /** Bài chưa nộp (đã quá hạn hoặc chưa) — dùng cho Báo cáo lớp */
  missing_assignments?: { _id: string; title: string; assignment_type: string; submission_deadline: string | null; session_number: string | null }[];
}

export interface ClassGroupUser {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  avatar?: string;
}

/** Nhóm thảo luận của lớp (phân từ CRM) — trả kèm trong GET /classes/:id/detail */
export interface ClassGroup {
  _id: string;
  group_name: string;
  assistant: ClassGroupUser | null;
  student_ids: ClassGroupUser[];
  max_students: number;
}

export interface ClassDetailStats {
  total_assignments: number;
  total_students: number;
  total_submissions: number;
  total_completed: number;
  completion_rate: number;
  average_score: number | null;
  assignments_by_type?: Record<string, number>;
}

export const STATUS_META: Record<ClassStatus, { label: string; tone: 'success' | 'warning' | 'info' | 'neutral' }> = {
  OPEN_REGISTRATION: { label: 'Mở đăng ký', tone: 'success' },
  CLOSED_REGISTRATION: { label: 'Đóng đăng ký', tone: 'warning' },
  IN_PROGRESS: { label: 'Đang dạy', tone: 'info' },
  ENDED: { label: 'Đã kết thúc', tone: 'neutral' },
};

export const COURSE_TYPE_LABEL: Record<string, string> = { zoom: 'Zoom', elearning: 'E-Learning', combo: 'Combo' };

/** Lớp có mình phụ trách (giáo viên chính hoặc nằm trong managers) — giống isUserClassOwner bên web. */
export const isMyClass = (c: StaffClassItem, userId?: string) =>
  !!userId && (c.teacher?._id === userId || (c.managers ?? []).includes(userId));

/** Danh sách lớp (GET /classes, 200 lớp, sắp theo trạng thái — như web /classes). Lọc phía máy. */
export function useStaffClasses(enabled = true) {
  return useQuery({
    queryKey: ['classes', 'staff'],
    enabled,
    queryFn: async () =>
      (
        await api.get<{ data: StaffClassItem[] }>('/classes', {
          params: { page: 1, limit: 200, sortBy: 'status_class', sortOrder: 'asc' },
        })
      ).data.data ?? [],
    staleTime: 2 * 60_000,
  });
}

/** Chi tiết lớp cho giáo viên: thống kê + học viên kèm tiến độ (GET /classes/:id/detail). */
export function useStaffClassDetail(classId: string) {
  return useQuery({
    queryKey: ['classes', 'staff', 'detail', classId],
    queryFn: async () =>
      (
        await api.get<{ stats: ClassDetailStats; students: ClassStudentStats[]; groups?: ClassGroup[] }>(`/classes/${classId}/detail`, {
          params: { page: 1, limit: 500 },
        })
      ).data,
    staleTime: 60_000,
  });
}

/** Khoá / mở khoá tài khoản (quyền STUDENT_BLOCK) và bảo lưu học viên (STUDENT_DEFERRAL_CREATE) — như menu ⋯ của web. */
export function useStudentAdmin(classId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['classes', 'staff', 'detail', classId] });
  const block = useMutation({
    mutationFn: async (v: { userId: string; active: boolean }) => {
      await api.patch(`/classes/students/${v.userId}/block`, { isActive: v.active });
    },
    onSuccess: () => void refresh(),
  });
  const defer = useMutation({
    mutationFn: async (v: { userId: string; months: number; reason: string }) => {
      const start = new Date();
      const end = new Date(start);
      end.setMonth(end.getMonth() + v.months);
      const fmt = (d: Date) => d.toISOString().split('T')[0];
      await api.post(`/classes/students/${v.userId}/deferral`, { class_id: classId, reason: v.reason, start_date: fmt(start), end_date: fmt(end) });
    },
    onSuccess: () => void refresh(),
  });
  return { block, defer };
}
