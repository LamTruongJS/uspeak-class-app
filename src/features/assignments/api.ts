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
  /** Bài Speak Your Mind (assignment_type.code = 'sym') — tiến độ bài nghe chép, xem features/assignments/sym-action.ts */
  sym?: SymAssignmentInfo | null;
}

export interface SymAssignmentInfo {
  total: number;
  level: 'easy' | 'medium' | 'hard' | null;
  /** Phải đúng TRÊN mức này (% số từ) mới tính hoàn thành */
  pass_score: number;
  progress: {
    status: 'in_progress' | 'completed';
    done: number;
    total: number;
    /** 0–100; chưa xong thì tối đa 99 */
    percent: number;
    score: number;
    attempts: number;
    /** Đã làm xong ≥ 1 lần nhưng chưa lần nào đạt `pass_score` */
    needs_retry: boolean;
  } | null;
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
 * Bài "Chưa nộp" (còn hạn) của mọi lớp — để đếm theo lớp. Không dùng useAllMyAssignments (200 bài đầu):
 * tài khoản nhiều bài thì lớp mới bị lọt khỏi 200 bài đó, đếm ra 0 (gặp 06/11/2026 với EET22).
 */
export function useMyTodoAssignments() {
  return useQuery({
    queryKey: ['assignments', 'mine', 'todo-all'],
    queryFn: async () =>
      (await api.get<StudentAssignmentsResponse>('/assignments/my', { params: { page: 1, limit: 200, status: 'not_submitted' } })).data.data ?? [],
  });
}

/** Tổng số bài theo trạng thái (tuỳ chọn 1 lớp) — chỉ đọc `pagination.total`, không tải danh sách */
export function useMyAssignmentTotal(status: StudentAssignmentStatus, classId?: string) {
  return useQuery({
    queryKey: ['assignments', 'mine', 'total', status, classId ?? ''],
    queryFn: async () => {
      const res = await api.get<StudentAssignmentsResponse>('/assignments/my', {
        params: { page: 1, limit: 1, status, class_id: classId || undefined },
      });
      return res.data.pagination?.total ?? res.data.total ?? 0;
    },
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

/**
 * Bài máy tự chấm điểm (TVST đi làm STEP 4–6): BE đặt requires_grading=false vì không giáo viên nào chấm,
 * nhưng có điểm thật (quiz_total_score → submission.score). Không coi là "Không cần chấm" — giống BE
 * getClassScores (`requires_grading !== false || tvst_business_target`). Báo cáo lớp từng hiện
 * "Không cần chấm" cho bài 0/10 (anh báo 06/11/2026).
 */
export function isAutoScored(a: StudentAssignmentItem) {
  return a.assignment_type?.code === 'tvst_business';
}

export function isNoGrading(a: StudentAssignmentItem) {
  if (isAutoScored(a) && a.submission?.grading_exempt !== true) return false;
  return !!a.submission && (a.requires_grading === false || a.submission.grading_exempt === true);
}

export function getAssignmentStatusView(a: StudentAssignmentItem): { label: string; tone: BadgeTone } {
  const resubmitted =
    (a.student_status === 'submitted' || a.student_status === 'late') && (a.submission?.attempt_number ?? 0) > 1;
  // Tự chấm xong là có điểm ngay — "Đã nhận xét" thì sai (không ai nhận xét)
  if (isAutoScored(a) && a.student_status === 'graded') return { label: 'Đã chấm điểm', tone: 'success' };
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
  // Bản sao formatAssignmentDescription của web (uspeak-class-fe AssignmentCardBubble.tsx). Mô tả có khi
  // lưu ở dạng ĐÃ MÃ HOÁ (&lt;iframe…&gt;, thậm chí &amp;lt;p&amp;gt;) → giải mã 2 lượt TRƯỚC rồi mới bóc
  // thẻ. Bản cũ bóc thẻ trước nên thẻ Bài tập mới hiện nguyên "<iframe width=…>" (anh báo 06/11/2026).
  const decoded = decodeHtmlEntities(decodeHtmlEntities(html || ''));
  return decoded
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(?:p|div|li|ul|ol|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/<[^>]*$/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code: string) => {
    if (code.startsWith('#')) {
      const hex = code[1]?.toLowerCase() === 'x';
      const n = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : entity;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}
