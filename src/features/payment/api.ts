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
  /** Số bài / số tiền sẽ THẬT SỰ vào đợt kế tiếp (class-be đã cắt theo hạn mức tiền/đợt). BE cũ chưa có. */
  next_request_submissions?: number;
  next_request_amount?: number;
  /** Hạn mức tiền của một đợt yêu cầu (BE: MAX_PAYMENT_REQUEST_AMOUNT). */
  max_request_amount?: number;
}

/**
 * Hạn mức tiền tối đa của MỘT đợt yêu cầu — bản sao MAX_PAYMENT_REQUEST_AMOUNT của class-be
 * (src/xp/xp.config.ts), chỉ dùng khi BE chưa trả `max_request_amount`. BE mới là nơi chốt.
 */
export const MAX_PAYMENT_REQUEST_AMOUNT = 5_000_000;

export interface NextPaymentRequestPlan {
  /** Số bài sẽ vào đợt kế tiếp (đã cắt theo hạn mức tiền) */
  count: number;
  /** Tổng tiền của đợt kế tiếp */
  amount: number;
  maxAmount: number;
  /** true = còn bài dư, để cho đợt sau */
  isCapped: boolean;
  leftoverCount: number;
  /** Lý do chặn nút gửi vì hạn mức (null = không chặn vì hạn mức) */
  blockReason: string | null;
  thresholdReached: boolean;
}

/**
 * Đợt yêu cầu kế tiếp — port `getNextPaymentRequestPlan` của web (stores/payment/payment.constants.ts),
 * dùng chung cho màn Yêu cầu thanh toán và Thống kê để hai nơi báo cùng một con số. BE cắt đợt theo
 * bài chấm sớm nhất tới khi chạm hạn mức nên tồn nhiều bài vẫn gửi được; chỉ chặn khi sau khi cắt
 * không còn đủ ngưỡng bài (đơn giá quá cao). `remaining_submissions` = `unpaid_count` của web.
 * Khác web một chỗ: ngưỡng 0 (cấu hình chưa tải) coi như không có ngưỡng — giữ cách app đang làm.
 */
export function getNextPaymentRequestPlan(earnings: EarningsSummary | undefined, threshold: number): NextPaymentRequestPlan {
  const unpaid = earnings?.remaining_submissions ?? 0;
  const maxAmount = earnings?.max_request_amount ?? MAX_PAYMENT_REQUEST_AMOUNT;
  const count = earnings?.next_request_submissions ?? unpaid;
  const amount = earnings?.next_request_amount ?? earnings?.remaining_amount ?? 0;
  const leftoverCount = Math.max(0, unpaid - count);
  const thresholdReached = unpaid > 0 && unpaid >= threshold;

  let blockReason: string | null = null;
  if (thresholdReached && count < threshold) {
    blockReason = `Với đơn giá hiện tại, ${threshold} bài đã vượt hạn mức ${formatMoney(maxAmount)}/đợt nên chưa gửi được. Vui lòng liên hệ Admin.`;
  } else if (thresholdReached && amount > maxAmount) {
    blockReason = `Tổng tiền đợt này (${formatMoney(amount)}) vượt hạn mức ${formatMoney(maxAmount)}/đợt. Vui lòng liên hệ Admin để kiểm tra đơn giá.`;
  }
  return { count, amount, maxAmount, isCapped: leftoverCount > 0, leftoverCount, blockReason, thresholdReached };
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

// ──────────────────────────────────────────────────────────────────────────
//  Cài đặt thanh toán (admin) — đơn giá nhận xét từng người
//  Bản mobile của trang /payment-settings bên web.
// ──────────────────────────────────────────────────────────────────────────

export interface GraderRateItem {
  grader_id: string;
  name: string;
  email: string;
  avatar?: string;
  role_code?: string;
  role_label?: string;
  grading_roles?: string[];
  is_secondary_grader?: boolean;
  rate: number;
  /** true = có đơn giá riêng, false = đang ăn đơn giá mặc định */
  is_custom: boolean;
  note?: string;
  updated_at?: string | null;
}

export const graderRateKeys = {
  list: (search?: string) => ['payment-settings', 'grader-rates', search ?? ''] as const,
};

export function useGraderRates(search?: string) {
  return useQuery({
    queryKey: graderRateKeys.list(search),
    queryFn: async () =>
      (
        await api.get<{ data: GraderRateItem[]; default_rate: number }>('/payment-settings/grader-rates', {
          params: search ? { search } : undefined,
        })
      ).data,
  });
}

/** `rate = null` → bỏ đơn giá riêng, người đó quay về ăn đơn giá mặc định. */
export function useSetGraderRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { grader_ids: string[]; rate: number | null; note?: string }) =>
      api.patch('/payment-settings/grader-rates', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-settings', 'grader-rates'] }),
  });
}

export function useSetDefaultGraderRate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rate: number) => api.patch('/payment-settings/grader-rates/default', { rate }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-settings', 'grader-rates'] }),
  });
}
