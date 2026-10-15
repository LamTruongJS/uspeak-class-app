import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BadgeTone } from '@/components/ui/badge';
import { api } from '@/lib/api/client';

/**
 * Khảo sát đầu vào — copy từ uspeak-class-fe src/stores/input-survey.
 * Nhân sự tạo phiếu cho một người quan tâm → gửi link công khai → họ tự nộp video giới thiệu →
 * giáo viên nhận xét "phù hợp / không phù hợp".
 *
 * App làm: xem danh sách, lọc trạng thái, tạo phiếu + lấy link để gửi, xem video, nhận xét.
 * Phần người ngoài tự điền vẫn là link web công khai (không nằm trong app).
 */
export type InputSurveyStatus = 'not_started' | 'pending_review' | 'suitable' | 'unsuitable';

export interface InputSurvey {
  _id: string;
  student_name: string;
  public_token: string;
  email?: string;
  phone?: string;
  videos: { url: string; video_id?: string }[];
  status: InputSurveyStatus;
  teacher_feedback?: string;
  teacher_result?: 'suitable' | 'unsuitable';
  submitted_at?: string;
  reviewed_at?: string;
  createdAt?: string;
}

interface SurveyListResponse {
  data: InputSurvey[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNextPage?: boolean };
}

export const SURVEY_STATUS_VIEW: Record<InputSurveyStatus, { label: string; tone: BadgeTone }> = {
  not_started: { label: 'Chưa làm', tone: 'neutral' },
  pending_review: { label: 'Chờ nhận xét', tone: 'warning' },
  suitable: { label: 'Phù hợp', tone: 'success' },
  unsuitable: { label: 'Không phù hợp', tone: 'danger' },
};

export const SURVEY_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'not_started', label: 'Chưa làm' },
  { value: 'pending_review', label: 'Chờ nhận xét' },
  { value: 'suitable', label: 'Phù hợp' },
  { value: 'unsuitable', label: 'Không phù hợp' },
];

const PAGE_SIZE = 20;

export const surveyKeys = {
  list: (status: string, search: string) => ['input-surveys', status, search] as const,
  detail: (id: string) => ['input-surveys', 'detail', id] as const,
};

export function useInputSurveys(params: { status: string; search: string }) {
  return useInfiniteQuery({
    queryKey: surveyKeys.list(params.status, params.search),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<SurveyListResponse>('/input-surveys', {
          params: {
            page: pageParam,
            limit: PAGE_SIZE,
            status: params.status === 'all' ? undefined : params.status,
            search: params.search || undefined,
          },
        })
      ).data,
    getNextPageParam: (last, pages) => (pages.length < (last.pagination?.totalPages ?? 1) ? pages.length + 1 : undefined),
  });
}

export function useInputSurvey(id: string) {
  return useQuery({
    queryKey: surveyKeys.detail(id),
    enabled: !!id,
    queryFn: async () => (await api.get<{ data: InputSurvey }>(`/input-surveys/${id}`)).data.data,
  });
}

export function useCreateInputSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (studentName: string) =>
      (await api.post<{ data: InputSurvey }>('/input-surveys', { student_name: studentName })).data.data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['input-surveys'] }),
  });
}

export function useReviewInputSurvey(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { teacher_feedback: string; teacher_result: 'suitable' | 'unsuitable' }) =>
      (await api.post<{ data: InputSurvey }>(`/input-surveys/${id}/review`, payload)).data.data,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: surveyKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: ['input-surveys'] });
    },
  });
}

/** Link công khai để gửi cho người cần làm khảo sát (trang web `/phieu-khao-sat?user=…`). */
export function surveyPublicUrl(webUrl: string, token: string) {
  return `${webUrl}/phieu-khao-sat?user=${token}`;
}

export function useDeleteInputSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/input-surveys/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['input-surveys'] }),
  });
}

/** Lời nhắn kèm link khi chia sẻ phiếu qua Zalo / Messenger… */
export function surveyShareMessage(webUrl: string, s: Pick<InputSurvey, 'student_name' | 'public_token'>) {
  return `Chào ${s.student_name}, Uspeak gửi bạn phiếu khảo sát đầu vào — bạn điền thông tin và nộp video giới thiệu tại link này nhé:\n${surveyPublicUrl(webUrl, s.public_token)}`;
}
