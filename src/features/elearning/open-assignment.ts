import { router } from 'expo-router';

import { queryClient } from '@/lib/query-client';
import { openAssignment } from '@/features/assignments/detail-api';
import type { StudentAssignmentItem } from '@/features/assignments/api';

/**
 * Mở bài tập từ cây E-Learning. Cây chỉ trả bài tập "thô" (không kèm trạng thái nộp của học
 * viên), nên tra trong cache danh sách bài tập của học viên trước để áp đúng luật điều hướng
 * (đã nhận xét → trang kết quả, còn lại → trang làm bài). Không có trong cache thì mở trang làm
 * bài — màn đó tự tải chi tiết và tự chuyển sang kết quả nếu cần.
 */
export function openAssignmentById(assignmentId: string) {
  const caches = queryClient.getQueriesData<{ pages?: { data: StudentAssignmentItem[] }[] } | StudentAssignmentItem[]>({
    queryKey: ['assignments', 'mine'],
  });

  for (const [, value] of caches) {
    const items = Array.isArray(value) ? value : (value?.pages?.flatMap((page) => page.data) ?? []);
    const found = items.find((item) => item._id === assignmentId);
    if (found) {
      openAssignment(found);
      return;
    }
  }

  router.push({ pathname: '/assignment/[id]', params: { id: assignmentId } });
}
