import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import type { BadgeTone } from '@/components/ui/badge';
import { api, type ApiResponse } from '@/lib/api/client';
import { uploadMultipart, type LocalFile } from '@/lib/api/upload';

/**
 * Góp ý / Báo lỗi — copy từ uspeak-class-fe src/stores/feedback.
 * Học viên & nhân sự gửi góp ý kèm ảnh, rồi nhắn qua lại với admin trong cùng một luồng.
 * Ảnh trong feedback do class-be ký presigned sẵn (7 ngày) → dùng thẳng, không cần media token.
 */
export type FeedbackType = 'BUG' | 'FEATURE' | 'FEEDBACK' | 'OTHER';
export type FeedbackStatus = 'NEW' | 'REPLIED' | 'CLOSED';

export interface FeedbackImage {
  key: string;
  url?: string;
  name?: string;
}

export interface FeedbackMessage {
  senderType: 'USER' | 'ADMIN';
  senderName?: string;
  message: string;
  images?: FeedbackImage[];
  createdAt: string;
}

export interface FeedbackItem {
  _id: string;
  userName: string;
  type: FeedbackType;
  message: string;
  images: FeedbackImage[];
  messages: FeedbackMessage[];
  status: FeedbackStatus;
  replyMessage?: string;
  createdAt: string;
  updatedAt: string;
}

interface FeedbackListResponse {
  data: FeedbackItem[];
  pagination?: { page: number; limit: number; total: number; totalPages: number };
}

export const FEEDBACK_TYPES: { value: FeedbackType; label: string; icon: 'bug' | 'bulb' | 'chatbubble-ellipses' | 'ellipsis-horizontal' }[] = [
  { value: 'BUG', label: 'Báo lỗi', icon: 'bug' },
  { value: 'FEATURE', label: 'Đề xuất tính năng', icon: 'bulb' },
  { value: 'FEEDBACK', label: 'Góp ý', icon: 'chatbubble-ellipses' },
  { value: 'OTHER', label: 'Khác', icon: 'ellipsis-horizontal' },
];

export const FEEDBACK_TYPE_LABEL: Record<FeedbackType, string> = {
  BUG: 'Báo lỗi',
  FEATURE: 'Đề xuất',
  FEEDBACK: 'Góp ý',
  OTHER: 'Khác',
};

export const FEEDBACK_STATUS_VIEW: Record<FeedbackStatus, { label: string; tone: BadgeTone }> = {
  NEW: { label: 'Chờ xử lý', tone: 'warning' },
  REPLIED: { label: 'Đã phản hồi', tone: 'success' },
  CLOSED: { label: 'Đã đóng', tone: 'neutral' },
};

const PAGE_SIZE = 20;

export const feedbackKeys = {
  mine: ['feedback', 'mine'] as const,
  detail: (id: string) => ['feedback', 'detail', id] as const,
};

export function useMyFeedback() {
  return useInfiniteQuery({
    queryKey: feedbackKeys.mine,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (await api.get<FeedbackListResponse>('/feedback/my', { params: { page: pageParam, limit: PAGE_SIZE } })).data,
    getNextPageParam: (last, pages) => {
      const totalPages = last.pagination?.totalPages ?? 1;
      return pages.length < totalPages ? pages.length + 1 : undefined;
    },
  });
}

export function useFeedbackDetail(id: string) {
  return useQuery({
    queryKey: feedbackKeys.detail(id),
    enabled: !!id,
    queryFn: async () => (await api.get<ApiResponse<FeedbackItem>>(`/feedback/${id}`)).data.data,
  });
}

/** Nén ảnh trước khi gửi (cạnh dài ≤ 1600px, JPEG 0.8) — giống lúc nộp bài tập. */
async function toFiles(uris: string[]): Promise<LocalFile[]> {
  const files: LocalFile[] = [];
  for (const [i, uri] of uris.entries()) {
    const out = await manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: SaveFormat.JPEG });
    files.push({ uri: out.uri, name: `feedback-${Date.now()}-${i}.jpg`, type: 'image/jpeg' });
  }
  return files;
}

export function useSubmitFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { type: FeedbackType; message: string; images: string[]; userId?: string; userName?: string }) => {
      const images = await toFiles(input.images);
      return uploadMultipart<ApiResponse<FeedbackItem>>('/feedback', {
        type: input.type,
        message: input.message,
        userId: input.userId ?? '',
        userName: input.userName ?? '',
        // Web gửi URL trang đang mở + tên trình duyệt; app gửi tên app + hệ điều hành để admin biết nguồn.
        currentUrl: 'app://uspeak-class-app',
        browser: `Uspeak Class App · ${Platform.OS} ${Platform.Version}`,
        createdAt: new Date().toISOString(),
        ...(images.length ? { images } : {}),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedbackKeys.mine }),
  });
}

export function useAddFeedbackMessage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { message: string; images: string[] }) => {
      const images = await toFiles(input.images);
      return uploadMultipart<ApiResponse<FeedbackItem>>(`/feedback/${id}/messages`, {
        message: input.message,
        ...(images.length ? { images } : {}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feedbackKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: feedbackKeys.mine });
    },
  });
}

// ──────────────────────────────────────────────────────────────────────────
//  Quản lý góp ý (admin) — bản mobile của trang /admin/feedback bên web
// ──────────────────────────────────────────────────────────────────────────

export interface FeedbackFilter {
  search?: string;
  type?: FeedbackType;
  status?: FeedbackStatus;
}

export const adminFeedbackKey = (f: FeedbackFilter) => ['feedback', 'all', f.search ?? '', f.type ?? '', f.status ?? ''] as const;

/** Toàn bộ góp ý (chỉ admin gọi được — class-be chặn bằng `ensureAdmin`). */
export function useAllFeedback(filter: FeedbackFilter) {
  return useInfiniteQuery({
    queryKey: adminFeedbackKey(filter),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<FeedbackListResponse>('/feedback', {
          params: { page: pageParam, limit: PAGE_SIZE, search: filter.search || undefined, type: filter.type, status: filter.status },
        })
      ).data,
    getNextPageParam: (last, pages) => {
      const totalPages = last.pagination?.totalPages ?? 1;
      return pages.length < totalPages ? pages.length + 1 : undefined;
    },
  });
}

/**
 * Đổi trạng thái góp ý (đã phản hồi / đóng / mở lại). Dùng chung endpoint `reply` của web:
 * gửi kèm `replyMessage` thì nó vừa đổi trạng thái vừa lưu câu trả lời, ở app chỉ cần phần trạng thái
 * vì nhắn thì đã có `POST /feedback/:id/messages` (giữ được cả ảnh).
 */
export function useSetFeedbackStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (status: FeedbackStatus) => (await api.patch<ApiResponse<FeedbackItem>>(`/feedback/${id}/reply`, { status })).data.data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feedbackKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: ['feedback'] });
    },
  });
}

export function useDeleteFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => api.delete(`/feedback/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feedback'] }),
  });
}
