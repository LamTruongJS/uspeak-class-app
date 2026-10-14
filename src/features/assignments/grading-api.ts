import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * Hàng chờ nhận xét (giáo viên / trợ giảng / người nhận xét) — copy từ uspeak-class-fe
 * src/stores/assignment (GradingQueueItem, getGradingQueue, claimSubmission). Luật "gấp" lấy từ
 * utils/constants/index.ts của web: hạn nhận xét còn < 12 giờ hoặc đã quá hạn.
 */
export interface GradingQueueItem {
  _id: string;
  assignment_id: string;
  assignment_title: string;
  assignment_type: { code: string; label: string } | null;
  class_name: string;
  class_code: string;
  class_id: string;
  student_id: string;
  student_name: string;
  student_avatar: string;
  status: 'submitted' | 'claimed' | 'reassigned' | string;
  is_late: boolean;
  attempt_number: number;
  submitted_at: string;
  grading_deadline: string | null;
  group_name?: string;
  grader_name?: string;
  session_number?: string;
}

interface GradingQueuePage {
  data: GradingQueueItem[];
  total: number;
  urgentTotal?: number;
  pagination: { page: number; totalPages: number; hasNextPage: boolean };
}

export type GradingStatusFilter = 'all' | 'submitted' | 'reassigned' | 'claimed';

export const URGENT_THRESHOLD_MS = 12 * 60 * 60 * 1000;

export type Urgency = 'overdue' | 'urgent' | 'normal';

export function deadlineUrgency(iso: string | null, now: number): Urgency {
  if (!iso) return 'normal';
  const diff = new Date(iso).getTime() - now;
  if (diff < 0) return 'overdue';
  if (diff < URGENT_THRESHOLD_MS) return 'urgent';
  return 'normal';
}

const PAGE_SIZE = 20;

export function useGradingQueue(params: { status: GradingStatusFilter; search: string }) {
  return useInfiniteQuery({
    queryKey: ['grading', 'queue', params],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<GradingQueuePage>('/assignments/grading-queue', {
          params: {
            page: pageParam,
            limit: PAGE_SIZE,
            status: params.status === 'all' ? undefined : params.status,
            search: params.search || undefined,
          },
        })
      ).data,
    getNextPageParam: (last) => (last.pagination?.hasNextPage ? last.pagination.page + 1 : undefined),
    staleTime: 30_000,
  });
}

/** Nhận bài để nhận xét — 409 / ALREADY_CLAIMED: người khác vừa nhận trước. */
export const gradingApi = {
  claim: (submissionId: string) => api.patch(`/assignments/submissions/${submissionId}/claim`),
};

// ─── Màn nhận xét bài (port uspeak-class-fe assignments/grading/[id]/page.tsx) ──────────────────

export interface GradingCriterion {
  name: string;
  maxScore: number;
  score: number;
  description: string;
}

/** Nhận xét theo mốc thời gian (video) hoặc theo ảnh (kind 'image' + itemKey) — đúng shape web gửi lên. */
export interface GradingComment {
  id: string;
  time: number;
  endTime?: number;
  text: string;
  createdAt: string;
  videoId?: string;
  kind?: 'video' | 'image';
  itemKey?: string;
}

export interface GradableItem {
  item_key: string;
  label: string;
  type: 'youtube_video' | 'image_upload' | string;
  video_urls: string[];
  image_urls: string[];
}

export interface SubmissionForGrading {
  _id: string;
  assignment_title: string;
  assignment_description?: string;
  assignment_review_requirement?: string;
  assignment_type: { code: string; label: string } | null;
  grading_criteria: { name: string; max_score: number; description?: string }[];
  class_name: string;
  class_code: string;
  student_id?: string;
  student_name: string;
  student_avatar?: string;
  submission_type: string;
  video_url?: string;
  video_urls?: string[];
  image_urls?: string[];
  gradable_items?: GradableItem[];
  status: string;
  is_late: boolean;
  attempt_number: number;
  submitted_at: string;
  claimed_at?: string;
  grading_duration_minutes?: number;
  status_before_claim?: string;
  reassign_reason?: string;
  reassigned_by_name?: string;
  redo_reason?: string;
  redo_requested_by_name?: string;
  regrade_reason?: string;
  regrade_requested_by_name?: string;
  /** Nhận xét hiện hành — màn Nhận xét lại / Review nạp sẵn từ đây */
  feedback?: {
    teacher_id?: string;
    teacher_name?: string;
    /** Số lỗi nhận xét đã ghi nhận của người nhận xét này */
    teacher_error_count?: number;
    text_feedback?: string;
    score?: number;
    criteria_scores?: { name: string; maxScore: number; score: number; description?: string }[];
    timestamp_comments?: GradingComment[];
    graded_at?: string;
  } | null;
  /** Góp ý của người review cho người nhận xét (màn Review) */
  grader_feedback?: { content?: string } | null;
}

export interface GraderOption {
  _id: string;
  name?: string;
  full_name?: string;
  email?: string;
  role_code?: string;
}

/** Người có thể nhận xét bài — cho "Chuyển người nhận xét" ở màn Review (GET /assignments/graders). */
export function useGraders(enabled: boolean) {
  return useQuery({
    queryKey: ['grading', 'graders'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = (await api.get<GraderOption[] | { data?: GraderOption[] }>('/assignments/graders')).data;
      return (Array.isArray(res) ? res : (res.data ?? [])) as GraderOption[];
    },
  });
}

export interface GradePayload {
  totalScore: number;
  criteria: GradingCriterion[];
  timestampComments: GradingComment[];
  generalFeedback: string;
}

export const gradingKeys = {
  submission: (id: string) => ['grading', 'submission', id] as const,
};

export function useSubmissionForGrading(submissionId: string) {
  return useQuery({
    queryKey: gradingKeys.submission(submissionId),
    enabled: !!submissionId,
    // Đang chấm thì KHÔNG tự tải lại: dữ liệu đổi giữa chừng (vd status) sẽ đá người chấm ra ngoài
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = (await api.get<{ data?: SubmissionForGrading } & SubmissionForGrading>(`/assignments/submissions/${submissionId}`)).data;
      return (res.data ?? res) as SubmissionForGrading;
    },
  });
}

export const gradingActions = {
  /** Báo "vẫn đang chấm" mỗi 30 giây — thiếu nhịp này BE tự trả bài về hàng chờ. */
  heartbeat: (id: string) => api.patch(`/assignments/submissions/${id}/heartbeat`).catch(() => undefined),
  release: (id: string) => api.patch(`/assignments/submissions/${id}/release`),
  /** Chấm bài / Nhận xét lại (`is_regrade: true`) — POST /grade như web */
  submit: (id: string, payload: GradePayload & { is_regrade?: boolean }) => api.post(`/assignments/submissions/${id}/grade`, payload),
  /** Review: phê duyệt kết quả (kèm góp ý cho người chấm) */
  review: (id: string, payload: GradePayload & { graderFeedback: string }) => api.post(`/assignments/submissions/${id}/review`, payload),
  /** Review: reviewer tự nhận xét thay — bài đứng tên reviewer, ghi 1 lỗi cho người chấm cũ */
  takeover: (id: string, payload: GradePayload & { graderFeedback: string; record_error: true }) =>
    api.post(`/assignments/submissions/${id}/takeover-grade`, payload),
  /** Review: chuyển bài cho người nhận xét khác (ghi lỗi người cũ) */
  returnToGrading: (id: string, payload: { reason: string; graderFeedback: string; assigned_grader_id: string; record_error: true }) =>
    api.post(`/assignments/submissions/${id}/return-to-grading`, payload),
  /** Review: yêu cầu người chấm cũ nhận xét lại */
  requestRegrade: (id: string, payload: { reason: string; record_error?: boolean }) =>
    api.post(`/assignments/submissions/${id}/request-regrade`, payload),
  requestRedo: (id: string, payload: { reason: string; redo_deadline?: string }) =>
    api.post(`/assignments/submissions/${id}/request-redo`, payload),
};
