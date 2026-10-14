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
