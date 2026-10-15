import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { BadgeTone } from '@/components/ui/badge';
import { api } from '@/lib/api/client';

/**
 * Thu nhập & yêu cầu thanh toán của người nhận xét bài — copy từ uspeak-class-fe
 * src/stores/payment (trang /payment-requests).
 *
 * Luật tiền nong nằm hết ở class-be (`getMyEarningsSummary`): bài đã nhận xét xong × đơn giá
 * tại thời điểm chấm, trừ bài đã trả và bài đang nằm trong yêu cầu chờ duyệt. App chỉ hiển thị
 * lại các con số đó, KHÔNG tự tính để khỏi lệch với CRM.
 */
export interface EarningsSummary {
  total_completed: number;
  current_level: number;
  current_rate: number;
  paid_amount: number;
  paid_submissions: number;
  locked_amount: number;
  locked_submissions: number;
  remaining_submissions: number;
  remaining_amount: number;
  total_earnings: number;
  /** Chưa điền CCCD / tài khoản ngân hàng thì class-be từ chối tạo yêu cầu. */
  is_payment_info_filled: boolean;
}

export type PaymentRequestStatus = 'pending' | 'approved' | 'rejected' | 'paid' | (string & {});

export interface PaymentRequestItem {
  _id: string;
  requested_submissions: number;
  total_payment: number;
  rate_per_assignment: number;
  level_at_request: number;
  status: PaymentRequestStatus;
  reason?: string;
  rejection_reason?: string;
  approved_at?: string;
  createdAt: string;
}

export const PAYMENT_STATUS_VIEW: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Chờ duyệt', tone: 'warning' },
  approved: { label: 'Đã duyệt', tone: 'info' },
  paid: { label: 'Đã thanh toán', tone: 'success' },
  rejected: { label: 'Từ chối', tone: 'danger' },
};

export function formatMoney(value?: number | null) {
  return `${Math.round(Number(value || 0)).toLocaleString('vi-VN')}đ`;
}

export function useMyEarnings() {
  return useQuery({
    queryKey: ['payment', 'my-earnings'],
    queryFn: async () => (await api.get<{ data: EarningsSummary }>('/payment-settings/my-earnings')).data.data,
  });
}

export function useMyPaymentRequests() {
  return useQuery({
    queryKey: ['payment', 'my-requests'],
    queryFn: async () =>
      (
        await api.get<{ data: PaymentRequestItem[]; has_pending: boolean; pagination: { total: number } }>(
          '/payment-settings/payment-requests/my',
          { params: { page: 1, limit: 50 } },
        )
      ).data,
  });
}

export function useSubmitPaymentRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => api.post('/payment-settings/payment-requests/request', { reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payment'] });
    },
  });
}

/**
 * Ngưỡng tối thiểu (số bài chưa thanh toán) để được gửi yêu cầu — `payment_threshold` của cấu hình XP
 * (GET /xp/config, web dùng `useXpConfig`). class-be cũng chặn lại khi gửi, đây chỉ để hiện tiến độ.
 */
export function usePaymentThreshold() {
  return useQuery({
    queryKey: ['payment', 'threshold'],
    staleTime: 10 * 60_000,
    queryFn: async () => Number((await api.get<{ data: { payment_threshold?: number } }>('/xp/config')).data.data?.payment_threshold ?? 0),
  });
}

export type SubmissionPaymentStatus = 'paid' | 'requested' | 'unrequested';

export interface GradedSubmissionPayment {
  _id: string;
  assignment?: {
    title?: string;
    session_number?: string;
    group_name?: string;
    class?: { class_code?: string; class_name?: string } | null;
  };
  student?: { name?: string; avatar_url?: string | null } | null;
  submitted_at?: string;
  graded_at?: string;
  rate_at_grading?: number;
  grading_time_seconds?: number;
  payment_request_status: SubmissionPaymentStatus;
}

export const SUBMISSION_PAYMENT_VIEW: Record<SubmissionPaymentStatus, { label: string; tone: BadgeTone }> = {
  paid: { label: 'Đã thanh toán', tone: 'success' },
  requested: { label: 'Đang yêu cầu', tone: 'info' },
  unrequested: { label: 'Chưa yêu cầu', tone: 'neutral' },
};

/** Từng bài đã chấm + trạng thái thanh toán của bài (tab "Danh sách bài đã chấm" của web). */
export function useMyGradedSubmissions(enabled: boolean) {
  return useQuery({
    queryKey: ['payment', 'my-submissions'],
    enabled,
    queryFn: async () =>
      (
        await api.get<{
          data: GradedSubmissionPayment[];
          summary: { total_graded: number; paid_total: number; in_request_total: number; unrequested_total: number };
        }>('/payment-settings/payment-requests/my-submissions')
      ).data,
  });
}
