import { useQuery } from '@tanstack/react-query';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';

import { api, type ApiResponse } from '@/lib/api/client';
import { queryClient } from '@/lib/query-client';
import { uploadMultipart, type LocalFile } from '@/lib/api/upload';

import type { StudentAssignmentItem } from './api';

/**
 * API làm bài / nộp bài / kết quả — port từ uspeak-class-fe/src/stores/assignment
 * (assignment.api.ts + types.ts). Kiểu dữ liệu rút gọn, giữ nguyên tên field của class-be.
 */

// ─── Kiểu dữ liệu ───────────────────────────────────────────────────────────

export type QuizQuestionType = 'single_choice' | 'multiple_choice' | 'speaking' | 'listening';

export interface QuizQuestion {
  key: string;
  type: QuizQuestionType;
  prompt: string;
  points: number;
  explanation?: string;
  options?: { key: string; text: string }[];
  correctKeys?: string[];
  referenceText?: string;
  locale?: string;
  audioUrl?: string;
}

export interface QuizAnswer {
  questionKey: string;
  selectedKeys?: string[];
  audioKey?: string;
  audioUrl?: string;
}

export interface QuizResult {
  questionKey: string;
  type: string;
  status: 'pending' | 'scored' | 'failed' | 'skipped' | 'processing';
  score: number;
  maxScore: number;
  isCorrect?: boolean;
  selectedKeys?: string[];
  audioKey?: string;
  error?: string;
  details?: Record<string, any>;
}

export interface SubmissionItemDef {
  key: string;
  label: string;
  type: 'youtube_video' | 'image_upload';
  requires_grading: boolean;
  instructions?: string;
  sort_order: number;
}

export interface AssignmentDetail {
  _id: string;
  title: string;
  description: string;
  class_id: string;
  assignment_type: { code: string; label: string } | null;
  submission_deadline: string | null;
  allow_late_submission: boolean;
  required_duration_minutes: number | null;
  grading_criteria: { name: string; max_score: number; description: string }[];
  requires_grading: boolean;
  test_template?: string | null;
  submission_items?: SubmissionItemDef[];
  can_submit: boolean;
  cannot_submit_reason: string;
  can_edit_submission: boolean;
  is_redo?: boolean;
  redo_reason?: string | null;
  shadowing?: {
    parts_total: number;
    targets_label: string;
    min_accuracy: number;
    deep_link_path: string;
    progress: { status: string; parts_completed: number; parts_total: number; accuracy: number | null } | null;
  } | null;
  latest_submission: {
    _id: string;
    status: string;
    video_url?: string;
    video_urls?: string[];
    image_urls?: string[];
    image_keys?: string[];
    item_submissions?: { item_key: string; type: string; video_urls: string[]; image_urls?: string[]; image_keys?: string[] }[];
    quiz_answers?: QuizAnswer[];
    submitted_at: string;
    attempt_number: number;
    is_late: boolean;
  } | null;
  quiz_draft?: {
    _id: string;
    answers: QuizAnswer[];
    /** Server tính lại từ started_at — mở lại app không được cấp thêm giờ */
    remaining_seconds: number;
    server_timed?: boolean;
  } | null;
  quiz_questions?: QuizQuestion[];
}

/** Nhãn + màu của trạng thái bài nộp — dùng chung cho màn kết quả và màn làm bài. */
export const SUBMISSION_STATUS: Record<string, { label: string; tone: 'info' | 'success' | 'warning' | 'violet' }> = {
  submitted: { label: 'Chờ nhận xét', tone: 'info' },
  claimed: { label: 'Đang nhận xét', tone: 'info' },
  waiting_review: { label: 'Đang duyệt nhận xét', tone: 'info' },
  regrade_requested: { label: 'Đang nhận xét lại', tone: 'warning' },
  reassigned: { label: 'Chờ nhận xét', tone: 'info' },
  timeout: { label: 'Chờ nhận xét', tone: 'info' },
  completed: { label: 'Đã nhận xét', tone: 'success' },
  graded: { label: 'Đã nhận xét', tone: 'success' },
  redo_requested: { label: 'Yêu cầu làm lại', tone: 'violet' },
};

export interface TimestampComment {
  id: string;
  time: number;
  endTime?: number;
  text: string;
  videoId?: string;
  itemKey?: string;
  kind?: 'video' | 'image';
}

export interface SubmissionResult {
  _id: string;
  assignment_id: string;
  assignment_title: string;
  /** Mô tả / yêu cầu của bài tập (HTML) — bên web là tab "Yêu cầu bài tập" */
  assignment_description?: string;
  /** Yêu cầu dành cho người nhận xét (HTML) — bên web là tab "Yêu cầu nhận xét" */
  assignment_review_requirement?: string;
  assignment_type: { code: string; label: string } | null;
  grading_criteria: { name: string; max_score: number; description?: string }[];
  class_name: string;
  class_code: string;
  submission_type: string;
  video_url: string;
  video_urls?: string[];
  image_urls?: string[];
  submitted_items?: {
    item_key: string;
    label: string;
    type: 'youtube_video' | 'image_upload';
    requires_grading: boolean;
    video_urls: string[];
    image_urls: string[];
  }[];
  quiz_questions?: QuizQuestion[];
  quiz_answers?: QuizAnswer[];
  quiz_results?: QuizResult[];
  quiz_total_score?: number | null;
  quiz_max_score?: number | null;
  status: string;
  requires_grading?: boolean;
  grading_exempt?: boolean;
  is_late: boolean;
  attempt_number: number;
  submitted_at: string;
  feedback?: {
    teacher_name: string;
    text_feedback: string;
    score: number;
    criteria_scores: { name: string; maxScore: number; score: number; description?: string }[];
    timestamp_comments: TimestampComment[];
    graded_at: string;
    /** Lần nhận xét thứ mấy (1 = lần đầu; > 1 là đã nhận xét lại) */
    grading_round?: number;
    /** Số lần nhận xét bị SỬA tại chỗ — học viên thấy để khỏi ngỡ ngàng khi điểm đổi */
    edit_count?: number;
    last_edited_at?: string | null;
    last_edited_by_name?: string;
  } | null;
}

// ─── Đọc dữ liệu ────────────────────────────────────────────────────────────

export const detailKeys = {
  assignment: (id: string) => ['assignments', 'detail', id] as const,
  result: (id: string) => ['assignments', 'result', id] as const,
};

export function useAssignmentDetail(id: string) {
  return useQuery({
    queryKey: detailKeys.assignment(id),
    queryFn: async () => (await api.get<ApiResponse<AssignmentDetail>>(`/assignments/${id}/detail`)).data.data,
    // Đang làm bài thì không tự refetch — refetch sẽ nạp lại nháp đè lên câu trả lời đang chọn.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** `asStaff`: nhân viên xem bài (GET /assignments/submissions/:id — cùng dữ liệu, kèm thông tin cho người chấm). */
export function useSubmissionResult(submissionId: string, asStaff = false) {
  return useQuery({
    queryKey: [...detailKeys.result(submissionId), asStaff ? 'staff' : 'student'],
    queryFn: async () =>
      (
        await api.get<ApiResponse<SubmissionResult>>(
          asStaff ? `/assignments/submissions/${submissionId}` : `/assignments/submissions/${submissionId}/student-result`,
        )
      ).data.data,
  });
}

/** Sau khi nộp: làm mới danh sách bài tập + lớp (tiến độ) + chi tiết bài. */
export function invalidateAfterSubmit(assignmentId: string) {
  void queryClient.invalidateQueries({ queryKey: ['assignments'] });
  void queryClient.invalidateQueries({ queryKey: ['classes'] });
  void queryClient.invalidateQueries({ queryKey: ['schedule'] });
  void queryClient.invalidateQueries({ queryKey: detailKeys.assignment(assignmentId) });
}

// ─── Nộp bài ────────────────────────────────────────────────────────────────

export const submitApi = {
  video: (id: string, videoUrls: string[]) =>
    api.post(`/assignments/${id}/submit-video`, { video_urls: videoUrls }),

  /** Sửa bài đã nộp (chỉ khi chưa ai nhận nhận xét) */
  edit: (submissionId: string, body: { video_urls?: string[]; image_keys?: string[] }) =>
    api.patch(`/assignments/submissions/${submissionId}/edit-submission`, body),

  image: (id: string, imageKeys: string[]) => api.post(`/assignments/${id}/submit-image`, { image_keys: imageKeys }),

  multi: (id: string, items: { item_key: string; video_urls?: string[]; image_keys?: string[] }[]) =>
    api.post(`/assignments/${id}/submit-multi`, { items }),

  quiz: (id: string, answers: QuizAnswer[]) =>
    api.post<unknown>(`/assignments/${id}/submit-quiz`, { answers }),

  /** Lưu nháp + nhận lại thời gian còn lại do server giữ */
  quizHealthCheck: (id: string, payload: { answers: QuizAnswer[]; remaining_seconds: number }) =>
    api.post<ApiResponse<{ remaining_seconds: number; server_timed: boolean }>>(
      `/assignments/${id}/quiz-health-check`,
      payload,
      { timeout: 15_000 },
    ),

  speakingSample: (id: string, questionKey: string) =>
    api.get<ApiResponse<{ url: string }>>(`/assignments/${id}/quiz-speaking-sample/${questionKey}`),

  /**
   * Upload bản thu 1 câu nói → server lưu + chấm Azure ngay.
   * iOS ghi sẵn WAV; Android chỉ ghi được m4a — class-be tự chuyển sang WAV (audio-transcode.util).
   */
  speaking: (id: string, questionKey: string, uri: string) => {
    const isWav = uri.toLowerCase().endsWith('.wav');
    return uploadMultipart<ApiResponse<{ audioKey: string; assessment: QuizResult | null }>>(
      `/assignments/${id}/upload-quiz-speaking/${questionKey}`,
      {
        audio: {
          uri,
          name: `${questionKey}.${isWav ? 'wav' : 'm4a'}`,
          type: isWav ? 'audio/wav' : 'audio/mp4',
        },
      },
    );
  },

  /** Nén ảnh (cạnh dài ≤ 1600px, JPEG 0.8) rồi upload → trả về S3 keys để nộp. */
  uploadImages: async (uris: string[]) => {
    const files: LocalFile[] = [];
    for (const [i, uri] of uris.entries()) {
      const out = await manipulateAsync(uri, [{ resize: { width: 1600 } }], {
        compress: 0.8,
        format: SaveFormat.JPEG,
      });
      files.push({ uri: out.uri, name: `image-${Date.now()}-${i}.jpg`, type: 'image/jpeg' });
    }
    const res = await uploadMultipart<ApiResponse<{ keys: string[]; urls: string[] }>>('/assignments/upload-images', {
      images: files,
    });
    return res.data.keys;
  },
};

/** Lấy id bài nộp từ response nộp quiz (BE trả lồng nhau vài kiểu — web cũng phải dò). */
export function extractSubmissionId(response: unknown): string | null {
  let payload: any = response;
  for (let i = 0; i < 4 && payload && typeof payload === 'object'; i += 1) {
    if (payload.submission) payload = payload.submission;
    else if ('_id' in payload || 'quiz_results' in payload) break;
    else if (payload.data) payload = payload.data;
    else break;
  }
  return payload?._id ?? payload?.submission_id ?? null;
}

// ─── Điều hướng ─────────────────────────────────────────────────────────────

/** Mở bài tập từ danh sách: đã nhận xét → trang kết quả; còn lại → trang làm bài (luật bên web). */
export function openAssignment(item: Pick<StudentAssignmentItem, '_id' | 'student_status' | 'submission' | 'shadowing'>) {
  const graded = item.student_status === 'graded' || item.submission?.status === 'graded';
  if (graded && item.submission?._id && !item.shadowing) {
    router.push({ pathname: '/result/[id]', params: { id: item.submission._id } });
  } else {
    router.push({ pathname: '/assignment/[id]', params: { id: item._id } });
  }
}

