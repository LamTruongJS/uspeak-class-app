import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { BadgeTone } from '@/components/ui/badge';
import { api } from '@/lib/api/client';

/** Copy từ uspeak-class-fe/src/stores/assignment/types.ts (StudentAssignmentItem) — rút gọn. */
export type StudentAssignmentStatus = 'not_submitted' | 'submitted' | 'late' | 'graded' | 'overdue';

export interface StudentAssignmentItem {
  _id: string;
  title: string;
  description: string;
  class_id: string;
  class_name: string;
  class_code: string;
  assignment_type: { code: string; label: string } | null;
  submission_deadline: string | null;
  allow_late_submission: boolean;
  requires_grading: boolean;
  student_status: StudentAssignmentStatus;
  submission: {
    _id: string;
    status: string;
    submitted_at: string;
    attempt_number: number;
    is_late: boolean;
    /** Miễn nhận xét (danh sách "Không cần nhận xét" của lớp) — KHÔNG phải đã chấm */
    grading_exempt?: boolean;
    score?: number | null;
    max_score?: number | null;
  } | null;
  session_number?: string;
  created_at: string;
  shadowing?: { parts_total: number; progress: { parts_completed: number } | null } | null;
}

export interface StudentAssignmentsResponse {
  data: StudentAssignmentItem[];
  total: number;
  total_all?: number;
  assignment_types?: { code: string; label: string }[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean };
}

export type AssignmentStatusFilter = 'all' | StudentAssignmentStatus;

export const STATUS_FILTERS: { value: AssignmentStatusFilter; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'not_submitted', label: 'Chưa nộp' },
  { value: 'submitted', label: 'Đã nộp' },
  { value: 'graded', label: 'Đã nhận xét' },
  { value: 'overdue', label: 'Quá hạn' },
  { value: 'late', label: 'Nộp trễ' },
];

const PAGE_SIZE = 20;

/** Toàn bộ bài tập (tối đa 200, giống web dashboard) — để tính điểm TB, chuyên cần, bài cần làm. */
export function useAllMyAssignments() {
  return useQuery({
    queryKey: ['assignments', 'mine', 'all'],
    queryFn: async () =>
      (await api.get<StudentAssignmentsResponse>('/assignments/my', { params: { page: 1, limit: 200 } })).data.data ?? [],
  });
}

/**
 * Toàn bộ bài tập của MỘT lớp (tối đa 200, xếp cũ → mới) — cho tab "Báo cáo" trong chi tiết lớp:
 * phải có đủ bài mới tính được điểm TB và tỉ lệ hoàn thành, không dùng danh sách phân trang được.
 */
export function useMyClassAssignments(classId: string, enabled = true) {
  return useQuery({
    queryKey: ['assignments', 'mine', 'class', classId],
    enabled: enabled && !!classId,
    queryFn: async () =>
      (
        await api.get<StudentAssignmentsResponse>('/assignments/my', {
          params: { page: 1, limit: 200, class_id: classId, sort_by: 'created_at', sort_order: 'asc' },
        })
      ).data.data ?? [],
  });
}

/** Bài tập của học viên (lọc theo lớp + trạng thái), cuộn tới đâu tải tới đó. */
export function useMyAssignments(params: { classId?: string; status: AssignmentStatusFilter; search?: string }) {
  return useInfiniteQuery({
    queryKey: ['assignments', 'mine', params],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<StudentAssignmentsResponse>('/assignments/my', {
        params: {
          page: pageParam,
          limit: PAGE_SIZE,
          class_id: params.classId,
          search: params.search || undefined,
          status: params.status === 'all' ? undefined : params.status,
          sort_by: 'created_at',
          sort_order: 'desc',
        },
      });
      return res.data;
    },
    getNextPageParam: (last) => (last.pagination?.hasNextPage ? last.pagination.page + 1 : undefined),
  });
}

// ─── Hiển thị trạng thái ────────────────────────────────────────────────────
// Luật lấy từ uspeak-class-fe (constants/submission-status.ts + my-classes/[classId]/page.tsx):
// bài "không cần chấm" đóng ở status completed giống bài đã chấm → phải hiện "Không cần chấm",
// KHÔNG hiện "Đã nhận xét" và KHÔNG hiện điểm 0.

export function isNoGrading(a: StudentAssignmentItem) {
  return !!a.submission && (a.requires_grading === false || a.submission.grading_exempt === true);
}

export function getAssignmentStatusView(a: StudentAssignmentItem): { label: string; tone: BadgeTone } {
  const resubmitted =
    (a.student_status === 'submitted' || a.student_status === 'late') && (a.submission?.attempt_number ?? 0) > 1;
  if (a.student_status !== 'not_submitted' && a.student_status !== 'overdue' && isNoGrading(a)) {
    return { label: 'Không cần chấm', tone: 'violet' };
  }
  switch (a.student_status) {
    case 'graded':
      return { label: 'Đã nhận xét', tone: 'success' };
    case 'submitted':
      return resubmitted ? { label: 'Đã nộp lại', tone: 'violet' } : { label: 'Đã nộp', tone: 'info' };
    case 'late':
      return resubmitted ? { label: 'Đã nộp lại', tone: 'violet' } : { label: 'Nộp trễ', tone: 'warning' };
    case 'overdue':
      return { label: 'Quá hạn', tone: 'danger' };
    default:
      return { label: 'Chưa nộp', tone: 'neutral' };
  }
}

/** Điểm hiển thị — null khi chưa chấm hoặc không cần chấm. */
export function getAssignmentScore(a: StudentAssignmentItem): string | null {
  if (isNoGrading(a)) return null;
  const score = a.submission?.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  const max = a.submission?.max_score;
  return max ? `${score}/${max}` : String(score);
}

/** Bỏ thẻ HTML khỏi mô tả (mô tả bài tập soạn bằng editor rich-text bên web). */
export function plainText(html?: string | null) {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
