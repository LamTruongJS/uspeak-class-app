import { useInfiniteQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * Bài tập của MỘT LỚP, nhìn từ phía giáo viên (GET /assignments?class_id=…) — copy kiểu
 * `AssignmentListItem` từ uspeak-class-fe src/stores/assignment/types.ts.
 *
 * Khác hẳn `features/assignments/api.ts` (GET /assignments/my): bên đó là bài của CHÍNH học viên
 * đang đăng nhập kèm trạng thái nộp của họ, bên này là bài của lớp kèm số lượng nộp/trễ/chưa nộp.
 */
export interface ClassAssignmentItem {
  _id: string;
  title: string;
  description: string;
  class_id: string;
  assignment_type: { code: string; label: string } | null;
  is_published: boolean;
  submission_deadline: string | null;
  grading_deadline: string | null;
  submission_count: number;
  on_time_count: number;
  late_count: number;
  not_submitted_count: number;
  session_number?: string | null;
  /** Bài giao từ hệ thống Shadowing (sửa/xoá ở hệ Shadowing, không phải ở class). */
  shadowing?: unknown | null;
  created_at: string;
}

interface ClassAssignmentsPage {
  data: ClassAssignmentItem[];
  total: number;
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean };
}

const PAGE_SIZE = 20;

export const ASSIGNMENT_TYPE_LABEL: Record<string, string> = {
  video_speaking: 'Video Speaking',
  quiz: 'Quiz',
  essay: 'Essay',
  image_upload: 'Image Upload',
  multi_task: 'Nhiều mục',
  youtube_video: 'YouTube Video',
  shadowing: 'Shadowing',
};

export function assignmentTypeLabel(code?: string | null) {
  if (!code) return 'Khác';
  return ASSIGNMENT_TYPE_LABEL[code] ?? code.replace(/_/g, ' ');
}

export function useClassAssignments(classId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ['assignments', 'class', classId],
    enabled: enabled && !!classId,
    initialPageParam: 1,
    staleTime: 60_000,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<ClassAssignmentsPage>('/assignments', {
          params: { page: pageParam, limit: PAGE_SIZE, class_id: classId, sort_by: 'created_at', sort_order: 'desc' },
        })
      ).data,
    getNextPageParam: (last) => (last.pagination?.hasNextPage ? last.pagination.page + 1 : undefined),
  });
}
