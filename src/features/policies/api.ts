import type { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ComponentProps } from 'react';

import { api } from '@/lib/api/client';

import generated from './content.generated.json';

/**
 * Chính sách (Điều khoản, Bảo mật, Hoàn học phí…).
 *
 * NỘI DUNG nằm cứng trong code web (`uspeak-class-fe/src/constants/policies`) — class-be chỉ giữ khoá,
 * phiên bản và ai đã đồng ý. App dùng bản chép `content.generated.json`, sinh bằng
 * `node scripts/sync-policies.cjs`: sửa chính sách ở web thì chạy lại script này.
 */
export type PolicyNode = string | { t: string; cls?: string; id?: string; href?: string; c?: PolicyNode[] };

export interface PolicyDoc {
  key: string;
  title: string;
  heading: string;
  version: string;
  meta: { label: string; value: string }[];
  toc: { id: string; label: string }[];
  body: PolicyNode[];
}

export const POLICIES = generated.policies as PolicyDoc[];

export const findPolicy = (key?: string) => POLICIES.find((p) => p.key === key);

type IconName = ComponentProps<typeof Ionicons>['name'];

export const POLICY_LOOK: Record<string, { icon: IconName; color: string; blurb: string }> = {
  'terms-of-use': { icon: 'document-text', color: '#2563eb', blurb: 'Quyền, nghĩa vụ khi dùng website & khoá học' },
  'privacy-policy': { icon: 'shield-checkmark', color: '#059669', blurb: 'Uspeak thu thập & bảo vệ dữ liệu của bạn ra sao' },
  'intellectual-property': { icon: 'bulb', color: '#7c3aed', blurb: 'Bản quyền video, tài liệu, nội dung bài học' },
  'refund-policy': { icon: 'cash', color: '#ea580c', blurb: 'Khi nào được hoàn, đổi lớp, bảo lưu, chuyển nhượng' },
  'payment-policy': { icon: 'card', color: '#b62025', blurb: 'Hình thức thanh toán, hoá đơn, xác nhận học phí' },
  'course-activation-policy': { icon: 'rocket', color: '#0891b2', blurb: 'Nhận tài khoản & kích hoạt khoá học online' },
  'complaint-handling-process': { icon: 'chatbubbles', color: '#d97706', blurb: 'Gửi khiếu nại và thời gian xử lý' },
};

export interface PolicyStatusItem {
  key: string;
  version: string;
  accepted: boolean;
  accepted_at: string | null;
}

/** GET /policies — trạng thái đồng ý từng chính sách của người đang đăng nhập. */
export function usePolicyStatus() {
  return useQuery({
    queryKey: ['policies', 'status'],
    queryFn: async () =>
      (await api.get<{ data: { policies: PolicyStatusItem[]; missing_policy_keys: string[]; all_accepted: boolean } }>('/policies')).data
        .data,
  });
}

export function useAcceptPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => api.post(`/policies/${key}/accept`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['policies'] }),
  });
}
