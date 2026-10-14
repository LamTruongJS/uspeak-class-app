import { useQuery } from '@tanstack/react-query';

import { api, type ApiResponse } from '@/lib/api/client';

/** Copy từ uspeak-class-fe/src/stores/assignment/types.ts (StudentClassItem) — bỏ field app chưa dùng. */
export interface StudentClassItem {
  _id: string;
  class_name: string;
  /** Tên hiển thị cho học viên (VD "Pro Talk 02") — ưu tiên hơn class_name nội bộ */
  display_name?: string;
  class_code: string;
  teacher?: { _id: string; name: string; avatar?: string | null } | null;
  class_time?: string;
  schedule?: string;
  course_type?: string;
  cover_image: string | null;
  total_assignments: number;
  completed_assignments: number;
  pending_assignments: number;
  progress: number;
  progress_source?: 'elearning' | 'sessions' | 'assignments';
  attendance_stats?: {
    attended_sessions: number;
    total_sessions: number;
    attendance_rate: number;
  } | null;
  remaining_debt?: number;
  /** Lớp nhận từ combo / quà tặng / chuyển lớp — học phí tính ở lớp gốc, không cộng nợ ở đây */
  from_combo_id?: string | null;
  is_gift_class_id?: string | null;
  is_from_class_id?: string | null;
  tuition_deadline?: string | null;
  /** Thông tin tạo mã VietQR chuyển khoản học phí (CRM trả kèm khi còn nợ). */
  qr_code?: {
    bank_id: string;
    account_no: string;
    account_name: string;
    student_name: string;
    student_phone: string;
    class_code: string;
  };
  /** Bị khoá quyền vào lớp (CRM) — lớp vẫn hiện nhưng bấm vào phải báo bị khoá */
  access_locked?: boolean;
  access_lock_reason?: string | null;
}

export const classesKeys = {
  all: ['classes'] as const,
  mine: () => [...classesKeys.all, 'mine'] as const,
};

export function useMyClasses() {
  return useQuery({
    queryKey: classesKeys.mine(),
    queryFn: async () => {
      const res = await api.get<ApiResponse<StudentClassItem[]>>('/assignments/my-classes');
      return res.data.data ?? [];
    },
  });
}

/** Thông tin 1 lớp — lấy từ danh sách lớp của học viên (web cũng làm vậy, không có API riêng). */
export function useClassInfo(classId: string) {
  const query = useMyClasses();
  return { ...query, data: query.data?.find((c) => c._id === classId) };
}

// ─── Điểm danh ──────────────────────────────────────────────────────────────

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused' | 'upcoming';

export interface AttendanceSession {
  session_number: number;
  date: string;
  topic: string;
  status: AttendanceStatus;
}

export function useStudentAttendance(classId: string, userId: string | undefined) {
  return useQuery({
    queryKey: [...classesKeys.all, 'attendance', classId, userId],
    enabled: !!classId && !!userId,
    queryFn: async () => {
      const res = await api.get<ApiResponse<AttendanceSession[]>>(
        `/classes/${classId}/students/${userId}/attendance`,
      );
      const now = Date.now();
      // Giống web: chỉ hiện buổi đã tới ngày (buổi tương lai nằm ở Lịch trình).
      return (res.data.data ?? []).filter((s) => {
        const t = new Date(s.date).getTime();
        return Number.isFinite(t) && t <= now;
      });
    },
  });
}

export function summarizeAttendance(sessions: AttendanceSession[]) {
  const count = (s: AttendanceStatus) => sessions.filter((a) => a.status === s).length;
  const present = count('present');
  const late = count('late');
  const absent = count('absent');
  const excused = count('excused');
  const completed = sessions.filter((a) => a.status !== 'upcoming').length;
  // Có mặt + đi trễ đều tính là đã tham gia (luật bên web)
  const rate = completed > 0 ? Math.round(((present + late) / completed) * 100) : 0;
  return { present, late, absent, excused, completed, rate };
}
