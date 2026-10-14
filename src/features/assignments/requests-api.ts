import { useInfiniteQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * Ba màn "theo dõi" của người nhận xét — copy từ uspeak-class-fe src/stores/assignment:
 * - Lịch sử nhận xét      GET /assignments/my-grading-history
 * - Bài yêu cầu làm lại   GET /assignments/my-redo-requests   (role: student | requester)
 * - Nhận xét bài lại      GET /assignments/my-regrade-requests (role: assigned | requester)
 *
 * `role` quyết định đứng ở phía nào của yêu cầu, ĐỪNG đổi bừa:
 * - redo: 'student' = bài NGƯỜI KHÁC yêu cầu tôi làm lại (ai cũng nộp bài nên dùng chung cho mọi
 *   vai trò — web từng dùng 'assigned' cho nhân viên và tab luôn rỗng), 'requester' = tôi yêu cầu.
 * - regrade: 'assigned' = tôi được giao nhận xét lại, 'requester' = tôi yêu cầu người khác.
 */

export interface GradingHistoryItem {
  _id: string;
  assignment_id: string;
  assignment_title: string;
  class_name: string;
  student_name: string;
  status: string;
  attempt_number: number;
  submitted_at: string;
  graded_at: string | null;
  grading_time_seconds: number;
  my_grading_status: 'graded' | 'in_progress' | 'left';
  session_number?: string;
}

interface RequestBase {
  _id: string;
  request_status: 'pending' | 'fulfilled' | string;
  reason?: string;
  created_at: string;
  is_requester: boolean;
  is_assigned_grader: boolean;
  requester_name?: string;
  assigned_grader_name?: string;
  submission_id: string;
  submission_status: string;
  attempt_number: number;
  assignment_id?: string;
  assignment_title: string;
  assignment_type?: { code: string; label: string } | null;
  session_number?: string | null;
  student_id?: string;
  student_name: string;
  student_avatar?: string;
  class_name: string;
  class_code: string;
}

export interface RedoRequestItem extends RequestBase {
  redo_deadline?: string | null;
  submission_deadline?: string | null;
  has_resubmitted: boolean;
  resubmission?: { _id: string; status: string; attempt_number: number; submitted_at: string } | null;
}

export interface RegradeRequestItem extends RequestBase {
  current_score?: number | null;
  fulfilled_at?: string | null;
}

interface Page<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean };
}

const PAGE_SIZE = 20;

export const REQUEST_STATUS_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending', label: 'Chưa xong' },
  { value: 'fulfilled', label: 'Đã xong' },
];

export const GRADING_HISTORY_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'completed', label: 'Đã nhận xét' },
  { value: 'claimed', label: 'Đang nhận xét' },
];

function paged<T>(key: unknown[], path: string, params: Record<string, string | number | undefined>) {
  return {
    queryKey: key,
    initialPageParam: 1,
    queryFn: async ({ pageParam }: { pageParam: number }) =>
      (await api.get<Page<T>>(path, { params: { ...params, page: pageParam, limit: PAGE_SIZE } })).data,
    getNextPageParam: (last: Page<T>) => (last.pagination?.hasNextPage ? last.pagination.page + 1 : undefined),
  };
}

export function useMyGradingHistory(params: { status: string; search: string }) {
  return useInfiniteQuery(
    paged<GradingHistoryItem>(['grading', 'history', params], '/assignments/my-grading-history', {
      status: params.status === 'all' ? undefined : params.status,
      search: params.search || undefined,
      sort_by: 'graded_at',
      sort_order: 'desc',
    }),
  );
}

export function useMyRedoRequests(params: { role: 'student' | 'requester'; status: string }) {
  return useInfiniteQuery(
    paged<RedoRequestItem>(['grading', 'redo', params], '/assignments/my-redo-requests', {
      role: params.role,
      status: params.status,
    }),
  );
}

export function useMyRegradeRequests(params: { role: 'assigned' | 'requester'; status: string }) {
  return useInfiniteQuery(
    paged<RegradeRequestItem>(['grading', 'regrade', params], '/assignments/my-regrade-requests', {
      role: params.role,
      status: params.status,
    }),
  );
}

export function formatGradingTime(seconds?: number) {
  if (!seconds || seconds < 0) return '—';
  const m = Math.round(seconds / 60);
  if (m < 1) return `${seconds}s`;
  if (m < 60) return `${m} phút`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}
