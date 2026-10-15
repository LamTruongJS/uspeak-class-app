import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import type { BadgeTone } from '@/components/ui/badge';
import { api } from '@/lib/api/client';

/**
 * Thông báo lớp học — copy kiểu + luật từ uspeak-class-fe src/stores/class-notification
 * (types.ts, class-notification.api.ts, class-notification.hooks.ts).
 *
 * Hai đường lấy dữ liệu khác nhau, đừng lẫn:
 * - Học viên: GET /class-notifications/:classId/active → chỉ thông báo ĐANG hiệu lực, phân trang
 *   cursor, ưu tiên tin chưa xem lên trước; đọc rồi thì POST /:id/mark-read.
 * - Nhân viên (AD/TE/TA/TG): GET /class-notifications/:classId → cả tin hẹn giờ và tin hết hiệu lực.
 */

export interface ClassNotificationAttachment {
  key: string;
  name: string;
  type: string;
  size: number;
  /** class-be trả kèm link S3 presigned (7 ngày) → dùng thẳng, không cần media token. */
  url?: string;
  width?: number;
  height?: number;
}

export interface ClassNotification {
  _id: string;
  class_id: string;
  title?: string;
  content: string;
  attachments: ClassNotificationAttachment[];
  video_url?: string;
  visible_from: string;
  visible_until: string | null;
  is_deleted?: boolean;
  is_read?: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface CursorPage {
  data: ClassNotification[];
  next_cursor: string | null;
  has_more: boolean;
}

export const classNotificationKeys = {
  all: ['class-notifications'] as const,
  active: (classId: string) => ['class-notifications', 'active', classId] as const,
  list: (classId: string) => ['class-notifications', 'list', classId] as const,
};

/** Đang trong khoảng hiển thị (visible_from … visible_until) và chưa bị xoá. */
export function isNotificationActive(n: ClassNotification, now: number) {
  const from = new Date(n.visible_from).getTime();
  const until = n.visible_until ? new Date(n.visible_until).getTime() : null;
  return !n.is_deleted && from <= now && (until === null || until >= now);
}

export function notificationStatus(n: ClassNotification, now: number): { label: string; tone: BadgeTone } {
  const from = new Date(n.visible_from).getTime();
  const until = n.visible_until ? new Date(n.visible_until).getTime() : null;
  if (from > now) return { label: 'Hẹn giờ', tone: 'warning' };
  if (until !== null && until < now) return { label: 'Hết hiệu lực', tone: 'neutral' };
  return { label: 'Đang hiển thị', tone: 'success' };
}

export function notificationTitle(n: ClassNotification) {
  return n.title?.trim() || 'Thông báo lớp học';
}

const PAGE_SIZE = 20;

/**
 * Thông báo đang hiệu lực (học viên). Lọc lại ở `queryFn` thay vì trong render: React Compiler
 * cấm gọi Date.now() khi render, và mỗi lần tải lại là một mốc giờ mới nên tin vừa hết hạn tự rụng.
 */
export function useActiveClassNotifications(classId: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: classNotificationKeys.active(classId),
    enabled: enabled && !!classId,
    initialPageParam: undefined as string | undefined,
    staleTime: 60_000,
    queryFn: async ({ pageParam }) => {
      const res = await api.get<CursorPage>(`/class-notifications/${classId}/active`, {
        params: { limit: PAGE_SIZE, cursor: pageParam },
      });
      const now = Date.now();
      const page = res.data;
      return { ...page, data: (page.data ?? []).filter((n) => isNotificationActive(n, now)) };
    },
    getNextPageParam: (last) => (last.has_more && last.next_cursor ? last.next_cursor : undefined),
  });
}

/** Toàn bộ thông báo của lớp (nhân viên) — gồm tin hẹn giờ + tin đã hết hiệu lực. */
export function useClassNotificationList(classId: string, enabled = true) {
  return useQuery({
    queryKey: classNotificationKeys.list(classId),
    enabled: enabled && !!classId,
    staleTime: 60_000,
    queryFn: async () => (await api.get<{ data: ClassNotification[] }>(`/class-notifications/${classId}`)).data.data ?? [],
  });
}

/**
 * Đánh dấu đã xem. CHỈ sửa cache, không invalidate: danh sách `active` của class-be xếp tin chưa
 * xem lên đầu, tải lại ngay lúc đang đọc sẽ làm thông báo nhảy chỗ dưới tay người dùng.
 */
export function useMarkClassNotificationRead(classId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => api.post(`/class-notifications/${notificationId}/mark-read`),
    onSuccess: (_data, notificationId) => {
      const mark = (n: ClassNotification) => (n._id === notificationId ? { ...n, is_read: true } : n);

      queryClient.setQueryData<InfiniteData<CursorPage>>(classNotificationKeys.active(classId), (current) =>
        current ? { ...current, pages: current.pages.map((p) => ({ ...p, data: p.data.map(mark) })) } : current,
      );
      queryClient.setQueryData<ClassNotification[]>(classNotificationKeys.list(classId), (current) => current?.map(mark));
    },
  });
}

// ─── Quản lý (nhân sự) — POST/PATCH/DELETE /class-notifications như hộp thoại tạo thông báo của web ───

export interface ClassNotificationPayload {
  title: string;
  content?: string;
  attachments?: Pick<ClassNotificationAttachment, 'key' | 'name' | 'type' | 'size'>[];
  video_url?: string;
  visible_from?: string;
  visible_until?: string | null;
}

export function useManageClassNotification(classId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['class-notifications'] });
  const save = useMutation({
    mutationFn: async (v: { id?: string; data: ClassNotificationPayload }) => {
      if (v.id) await api.patch(`/class-notifications/${v.id}`, v.data);
      else await api.post(`/class-notifications/${classId}`, v.data);
    },
    onSuccess: () => void refresh(),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/class-notifications/${id}`);
    },
    onSuccess: () => void refresh(),
  });
  return { save, remove };
}
