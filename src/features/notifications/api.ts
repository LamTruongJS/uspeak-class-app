import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, type ComponentProps } from 'react';

import { api } from '@/lib/api/client';

/**
 * Thông báo hệ thống (chuông) — cùng API với nút chuông bên web (uspeak-class-fe
 * components/Notification/NotificationBell.tsx): GET /notifications, /notifications/unread-count,
 * PATCH /notifications/:id/read, /notifications/read-all.
 *
 * Web nghe socket `/notifications` để cập nhật số chưa đọc ngay; app hỏi lại mỗi 30 giây (như
 * `refetchInterval` của web) + khi có push tới — push đã báo người dùng tức thì rồi.
 */

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Copy từ class-be database/enums.ts NotificationType */
export type NotificationType =
  | 'ASSIGNMENT_PUBLISHED'
  | 'SUBMISSION_APPROVED'
  | 'GRADING_APPROVED'
  | 'SUBMISSION_PENDING_REVIEW'
  | 'REGRADE_REQUESTED'
  | 'SUBMISSION_ASSIGNED'
  | 'SUBMISSION_REASSIGNED'
  | 'REDO_REQUESTED'
  | 'REDO_RESUBMITTED'
  | 'PAYMENT_REQUEST_APPROVED'
  | 'PAYMENT_REQUEST_REJECTED'
  | 'REGRADE_COMPLETED'
  | 'SURVEY_REMINDER'
  | 'INPUT_SURVEY_SUBMITTED';

export interface AppNotification {
  _id: string;
  type: NotificationType | string;
  title: string;
  message: string;
  read: boolean;
  related_id?: string;
  related_type?: string;
  metadata?: { assignmentId?: string; submissionId?: string; classId?: string; surveyId?: string; [k: string]: unknown };
  createdAt: string;
}

interface Page {
  data: AppNotification[];
  total: number;
  page: number;
  limit: number;
}

const PAGE_SIZE = 20;
const LIST_KEY = ['notifications', 'list'] as const;
const COUNT_KEY = ['notifications', 'unread-count'] as const;

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: COUNT_KEY,
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async () => {
      try {
        return (await api.get<{ count: number }>('/notifications/unread-count')).data.count ?? 0;
      } catch {
        // Gọi nền mỗi 30s — lỗi mạng thì giữ 0, không báo lỗi
        return 0;
      }
    },
  });
}

export function useNotificationList() {
  return useInfiniteQuery({
    queryKey: LIST_KEY,
    initialPageParam: 1,
    staleTime: 15_000,
    queryFn: async ({ pageParam }) => {
      const res = (await api.get<Page | { data: Page }>('/notifications', { params: { page: pageParam, limit: PAGE_SIZE } })).data;
      // Endpoint lúc bọc { data: {...} } lúc không (web cũng đỡ cả hai)
      return ('data' in res && !Array.isArray(res.data) ? res.data : res) as Page;
    },
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
}

/** Push tới / mở lại app → làm mới số + danh sách */
export function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }), [queryClient]);
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/notifications/${id}/read`);
    },
    // Cập nhật ngay trên máy, không chờ server
    onMutate: (id) => {
      queryClient.setQueryData<InfiniteData<Page>>(LIST_KEY, (old) =>
        old ? { ...old, pages: old.pages.map((p) => ({ ...p, data: p.data.map((n) => (n._id === id ? { ...n, read: true } : n)) })) } : old,
      );
      queryClient.setQueryData<number>(COUNT_KEY, (c) => Math.max(0, (c ?? 1) - 1));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: COUNT_KEY }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.patch('/notifications/read-all');
    },
    onSuccess: () => {
      queryClient.setQueryData<InfiniteData<Page>>(LIST_KEY, (old) =>
        old ? { ...old, pages: old.pages.map((p) => ({ ...p, data: p.data.map((n) => ({ ...n, read: true })) })) } : old,
      );
      queryClient.setQueryData(COUNT_KEY, 0);
    },
  });
}

/** Icon + màu theo loại thông báo */
export function notificationLook(type: string): { icon: IconName; tone: 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'violet' } {
  switch (type) {
    case 'ASSIGNMENT_PUBLISHED':
      return { icon: 'document-text', tone: 'info' };
    case 'SUBMISSION_APPROVED':
    case 'GRADING_APPROVED':
    case 'REGRADE_COMPLETED':
      return { icon: 'checkmark-circle', tone: 'success' };
    case 'SUBMISSION_PENDING_REVIEW':
      return { icon: 'eye', tone: 'violet' };
    case 'REGRADE_REQUESTED':
    case 'REDO_REQUESTED':
      return { icon: 'refresh-circle', tone: 'warning' };
    case 'REDO_RESUBMITTED':
      return { icon: 'cloud-upload', tone: 'info' };
    case 'SUBMISSION_ASSIGNED':
    case 'SUBMISSION_REASSIGNED':
      return { icon: 'swap-horizontal', tone: 'brand' };
    case 'PAYMENT_REQUEST_APPROVED':
      return { icon: 'wallet', tone: 'success' };
    case 'PAYMENT_REQUEST_REJECTED':
      return { icon: 'wallet', tone: 'danger' };
    case 'SURVEY_REMINDER':
    case 'INPUT_SURVEY_SUBMITTED':
      return { icon: 'clipboard', tone: 'violet' };
    default:
      return { icon: 'notifications', tone: 'brand' };
  }
}

/**
 * Mở đúng màn theo loại thông báo — map từ handleNotificationClick bên web, mở rộng cho các loại web
 * chưa xử lý (bài được duyệt, chờ review, yêu cầu làm lại…). Trả false khi loại này không có màn để mở.
 */
export function openNotification(n: AppNotification): boolean {
  const m = n.metadata ?? {};
  const submissionId = m.submissionId || (n.related_type === 'submission' ? n.related_id : undefined) || n.related_id;
  switch (n.type) {
    case 'ASSIGNMENT_PUBLISHED': {
      const id = m.assignmentId || n.related_id;
      if (!id) return false;
      router.push({ pathname: '/assignment/[id]', params: { id } });
      return true;
    }
    // Học viên: bài đã được nhận xét / được yêu cầu làm lại → xem kết quả
    case 'SUBMISSION_APPROVED':
    case 'REDO_REQUESTED':
      if (!submissionId) return false;
      router.push({ pathname: '/result/[id]', params: { id: submissionId } });
      return true;
    // Nhân sự: kết quả bài mình chấm / bài đã chuyển / bài đã làm lại / đã nhận xét lại
    case 'GRADING_APPROVED':
    case 'SUBMISSION_REASSIGNED':
    case 'REDO_RESUBMITTED':
    case 'REGRADE_COMPLETED':
      if (!submissionId) return false;
      router.push({ pathname: '/result/[id]', params: { id: submissionId, staff: '1' } });
      return true;
    case 'SUBMISSION_PENDING_REVIEW':
      if (!submissionId) return false;
      router.push({ pathname: '/grading/review/[id]', params: { id: submissionId } });
      return true;
    case 'REGRADE_REQUESTED':
      if (!submissionId) return false;
      router.push({ pathname: '/grading/regrade/[id]', params: { id: submissionId } });
      return true;
    case 'SUBMISSION_ASSIGNED':
      router.navigate('/assignments');
      return true;
    case 'PAYMENT_REQUEST_APPROVED':
    case 'PAYMENT_REQUEST_REJECTED':
      router.push('/grading/payment-requests');
      return true;
    case 'SURVEY_REMINDER':
      router.push('/class-surveys');
      return true;
    case 'INPUT_SURVEY_SUBMITTED': {
      const id = m.surveyId || n.related_id;
      if (id) router.push({ pathname: '/surveys/[id]', params: { id } });
      else router.push('/surveys');
      return true;
    }
    default:
      return false;
  }
}

/** "Vừa xong" / "5 phút trước" / "3 giờ trước" / "Hôm qua" / "12/10" — `now` truyền vào (React Compiler). */
export function timeAgo(iso: string, now: number) {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, now - t) / 1000;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 2 * 86400) return 'Hôm qua';
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} ngày trước`;
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
