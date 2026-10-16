import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * Quản lý chấm bài + Thống kê nhận xét — chép từ uspeak-class-fe
 * assignments/grading-management/page.tsx và reports/page.tsx (cùng endpoint).
 */

// ─── Quản lý chấm bài (GET /assignments/grading-management) ─────────────────

export interface ManagedSubmission {
  _id: string;
  assignment_title: string;
  class_name: string;
  student_name: string;
  student_avatar: string | null;
  status: string;
  submission_type: string;
  submitted_at: string;
  graded_at: string | null;
  attempt_number: number;
  score: number | null;
  max_score: number | null;
  grader_name: string;
  grader_avatar: string | null;
  reviewer_name: string;
  reviewer_avatar: string | null;
  requires_grading: boolean;
  grading_exempt?: boolean;
}

export const MANAGEMENT_STATUS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'waiting_review', label: 'Chờ review' },
  { value: 'completed', label: 'Hoàn tất' },
];

export const MANAGED_STATUS_VIEW: Record<string, { label: string; tone: 'warning' | 'info' | 'success' | 'neutral' | 'violet' }> = {
  submitted: { label: 'Chờ nhận', tone: 'warning' },
  waiting_review: { label: 'Chờ review', tone: 'info' },
  claimed: { label: 'Đang chấm', tone: 'success' },
  completed: { label: 'Đã hoàn tất', tone: 'neutral' },
};

export function useGradingManagement(params: { search: string; status: string; classId: string; graderId: string }) {
  return useInfiniteQuery({
    queryKey: ['assignments', 'grading-management', params],
    initialPageParam: 1,
    staleTime: 30_000,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<{ data: ManagedSubmission[]; pagination: { page: number; totalPages: number; total: number } }>('/assignments/grading-management', {
          params: {
            page: pageParam,
            limit: 20,
            search: params.search || undefined,
            status: params.status === 'ALL' ? undefined : params.status,
            class_id: params.classId === 'ALL' ? undefined : params.classId,
            grader_id: params.graderId === 'ALL' ? undefined : params.graderId,
          },
        })
      ).data,
    getNextPageParam: (last) => (last.pagination && last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined),
  });
}

// ─── Thống kê nhận xét ──────────────────────────────────────────────────────

export type StatsMode = 'day' | 'week' | 'month' | 'year';
export type StatsDetailType = 'graded' | 'timeout' | 'regrade' | 'lateGraded';

export interface GradingStats {
  mode: StatsMode;
  summary: { totalGraded: number; totalLateGraded: number; totalTimeout: number; totalRegrade: number; totalWaitingReview: number };
  timeSeries: { label: string; graded: number; lateGraded: number; timeout: number; regrade: number; waitingReview: number }[];
}

export interface XpProfile {
  full_name: string;
  level: number;
  currentXP: number;
  nextLevelXP: number;
  progress: number;
  totalXP: number;
  rank: number;
  totalGraders: number;
  levelTitle: string;
  levelEmoji: string;
}

export interface XpTransaction {
  _id: string;
  event_type: 'graded' | 'timeout' | 'regrade' | 'admin_adjust';
  xp_change: number;
  created_at: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  note?: string;
}

export interface StatsDetailItem {
  _id: string;
  assignment_title: string;
  student_name: string;
  graded_at: string;
  status: string;
  reason?: string;
  payment_status?: string;
}

export function useGradingStats(mode: StatsMode) {
  return useQuery({
    queryKey: ['assignments', 'grading-stats', mode],
    queryFn: async () => (await api.get<{ data: GradingStats }>('/assignments/stats/grading-timeseries', { params: { mode } })).data.data,
  });
}

export function useGradingStatsDetail(mode: StatsMode, type: StatsDetailType | null) {
  return useInfiniteQuery({
    queryKey: ['assignments', 'grading-stats-detail', mode, type],
    enabled: !!type,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const res = (await api.get<{ data?: { items: StatsDetailItem[]; pagination: { page: number; totalPages: number; total: number } }; items?: StatsDetailItem[]; pagination?: { page: number; totalPages: number; total: number } }>(
        '/assignments/stats/grading-detail',
        { params: { mode, type, page: pageParam, limit: 20 } },
      )).data;
      return res.data ?? { items: res.items ?? [], pagination: res.pagination ?? { page: 1, totalPages: 1, total: 0 } };
    },
    getNextPageParam: (last) => (last.pagination && last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined),
  });
}

export function useXpProfile() {
  return useQuery({
    queryKey: ['xp', 'profile'],
    queryFn: async () => (await api.get<{ data: XpProfile }>('/xp/profile')).data.data,
  });
}

export function useXpHistory() {
  return useQuery({
    queryKey: ['xp', 'history'],
    queryFn: async () => {
      const res = (await api.get<{ data?: { transactions?: XpTransaction[] } }>('/xp/history', { params: { page: 1, limit: 8 } })).data.data;
      return res?.transactions ?? [];
    },
  });
}

export function useMyPaymentSummary(enabled: boolean) {
  return useQuery({
    queryKey: ['payment', 'my-summary'],
    enabled,
    queryFn: async () =>
      (await api.get<{ data: { total_paid: number; total_batches_paid: number; last_paid_at: string | null } }>('/payment-settings/my-payment-summary')).data.data,
  });
}
