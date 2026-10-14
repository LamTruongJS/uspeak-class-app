import { useQuery } from '@tanstack/react-query';

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
}

export interface ClassDetailStats {
  total_assignments: number;
  total_students: number;
  total_submissions: number;
  total_completed: number;
  completion_rate: number;
  average_score: number | null;
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
        await api.get<{ stats: ClassDetailStats; students: ClassStudentStats[] }>(`/classes/${classId}/detail`, {
          params: { page: 1, limit: 500 },
        })
      ).data,
    staleTime: 60_000,
  });
}
