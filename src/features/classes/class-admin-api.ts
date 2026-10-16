import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * Các tab quản lý lớp còn lại của web (uspeak-class-fe classes/[classId]/*Tab.tsx) cho app:
 * Bài nộp + Review (ClassSubmissionsTab, ClassReviewsTab), Không cần nhận xét (GradingExemptionsTab),
 * Khảo sát (ClassSurveyTab), Chứng chỉ (CertificateManagementTab), Luyện tập nói (PracticeManagementTab).
 * Cùng endpoint với web — sửa luật ở web thì sửa cả đây.
 */

// ─── Bài nộp của lớp ────────────────────────────────────────────────────────

export interface ClassSubmissionItem {
  _id: string;
  assignment_id: string;
  assignment_title: string;
  assignment_type: { code: string; label: string } | null;
  session_number: string | number | null;
  student_id: string;
  student_name: string;
  student_avatar: string;
  status: string;
  is_late: boolean;
  attempt_number: number;
  submitted_at: string;
  score: number | null;
  max_score: number | null;
  requires_grading?: boolean;
  grading_exempt?: boolean;
}

export const SUBMISSION_FILTERS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'submitted', label: 'Chờ nhận xét' },
  { value: 'claimed', label: 'Đang chấm' },
  { value: 'waiting_review', label: 'Chờ review' },
  { value: 'completed', label: 'Đã nhận xét' },
  { value: 'redo_requested', label: 'Yêu cầu làm lại' },
  { value: 'regrade_requested', label: 'Nhận xét lại' },
  { value: 'reassigned', label: 'Đã chuyển giao' },
  { value: 'timeout', label: 'Quá hạn' },
];

export function useClassSubmissionList(
  classId: string,
  params: { status: string; search: string; assignmentId: string },
  /** Chỉ bài của các học viên này (xem theo nhóm); undefined = cả lớp */
  studentIds?: string[],
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: ['assignments', 'class-submissions', classId, params, studentIds?.join(',') ?? 'all'],
    enabled: enabled && !!classId,
    initialPageParam: 1,
    staleTime: 30_000,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<{ data: ClassSubmissionItem[]; pagination: { page: number; totalPages: number; total: number } }>(
          `/assignments/classes/${classId}/submissions`,
          {
            params: {
              page: pageParam,
              limit: 20,
              status: params.status === 'ALL' ? undefined : params.status,
              search: params.search || undefined,
              assignment_id: params.assignmentId === 'ALL' ? undefined : params.assignmentId,
              student_ids: studentIds?.length ? studentIds.join(',') : undefined,
              sort_by: 'submitted_at',
              sort_order: 'desc',
            },
          },
        )
      ).data,
    getNextPageParam: (last) => (last.pagination && last.pagination.page < last.pagination.totalPages ? last.pagination.page + 1 : undefined),
  });
}

export function useSubmissionAdmin() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['assignments'] });
  const bulkReview = useMutation({
    mutationFn: async (ids: string[]) =>
      (await api.post<{ reviewed_count?: number; skipped_ids?: string[] }>('/assignments/submissions/review/bulk', { submission_ids: ids })).data,
    onSuccess: () => void refresh(),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/assignments/submissions/${id}`);
    },
    onSuccess: () => void refresh(),
  });
  return { bulkReview, remove };
}

// ─── Không cần nhận xét ─────────────────────────────────────────────────────

export interface GradingExemption {
  _id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  student_avatar: string;
  reason: string;
  created_by_name: string;
  created_at: string;
}

export function useGradingExemptions(classId: string) {
  const qc = useQueryClient();
  const key = ['assignments', 'grading-exemptions', classId];
  const list = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ data: GradingExemption[] }>(`/assignments/classes/${classId}/grading-exemptions`)).data.data ?? [],
  });
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ['assignments', 'class-submissions'] })]);
  const add = useMutation({
    mutationFn: async (v: { studentIds: string[]; reason: string }) =>
      (
        await api.post<{ message: string; added: number; closed_pending_submissions: number }>(`/assignments/classes/${classId}/grading-exemptions`, {
          student_ids: v.studentIds,
          reason: v.reason || undefined,
        })
      ).data,
    onSuccess: () => void refresh(),
  });
  const remove = useMutation({
    mutationFn: async (studentId: string) => {
      await api.delete(`/assignments/classes/${classId}/grading-exemptions/${studentId}`);
    },
    onSuccess: () => void refresh(),
  });
  const sweep = useMutation({
    mutationFn: async (studentId?: string) =>
      (
        await api.post<{ message: string; closed: number; kept_graded: number; released_from_graders: number }>(
          `/assignments/classes/${classId}/grading-exemptions/sweep`,
          { student_id: studentId },
        )
      ).data,
    onSuccess: () => void refresh(),
  });
  return { list, add, remove, sweep };
}

// ─── Khảo sát lớp ───────────────────────────────────────────────────────────

export interface SurveyFieldDef {
  field_key: string;
  label: string;
  type: string;
  options?: { label: string; value: string }[];
}

export interface SurveyTemplateLite {
  _id: string;
  title: string;
  description?: string;
  fields: SurveyFieldDef[];
}

export interface SurveyResponseItem {
  _id: string;
  user_id?: string;
  answers: { field_key: string; value: string | string[] }[];
  submitted_at: string;
  user?: { _id: string; name: string; email: string; phone?: string; avatar?: string };
}

export function useClassSurveyTemplates(classId: string) {
  return useQuery({
    queryKey: ['survey', 'templates', classId],
    queryFn: async () => {
      const res = (await api.get<{ data?: SurveyTemplateLite[] } | SurveyTemplateLite[]>('/survey/templates/active', { params: { classId } })).data;
      return (Array.isArray(res) ? res : res.data) ?? [];
    },
  });
}

export function useClassSurveyResponses(classId: string, templateId: string) {
  return useQuery({
    queryKey: ['survey', 'responses', classId, templateId],
    enabled: !!templateId,
    queryFn: async () => {
      const res = (await api.get<{ data?: { data: SurveyResponseItem[] } | SurveyResponseItem[] }>('/survey/responses', {
        params: { class_id: classId, template_id: templateId, page: 1, limit: 500 },
      })).data;
      const inner = res.data;
      return (Array.isArray(inner) ? inner : inner?.data) ?? [];
    },
  });
}

export function useSurveyRemind(classId: string) {
  const one = useMutation({
    mutationFn: async (v: { templateId: string; studentId: string }) => {
      await api.post(`/survey/${classId}/remind/${v.templateId}/${v.studentId}`);
    },
  });
  const all = useMutation({
    mutationFn: async (v: { templateId: string; studentIds?: string[] }) => {
      await api.post(`/survey/${classId}/remind-all/${v.templateId}`, { studentIds: v.studentIds });
    },
  });
  return { one, all };
}

// ─── Chứng chỉ ──────────────────────────────────────────────────────────────

export interface CertificateStudent {
  studentId: string;
  studentName: string;
  email?: string | null;
  metrics: { absentCount: number; submittedCount: number; missingCount: number; averageScore: number | null; scoreCriteriaWaived?: boolean };
  eligible: boolean;
  ineligibleReasons: string[];
  certificate?: { id: string; status: 'pending' | 'generated' | 'failed'; templateSlug: string; createdAt: string; error?: string | null } | null;
}

export interface CertificateTemplate {
  slug: string;
  config: { name: string; version: number };
  previewUrl: string;
}

export interface CertificateHistoryItem {
  id: string;
  studentId: string;
  studentName: string;
  email?: string | null;
  templateSlug: string;
  status: 'pending' | 'generated' | 'failed';
  emailStatus: 'none' | 'queued' | 'sent' | 'failed';
  sendCount: number;
  presignedUrl?: string | null;
  updatedAt: string;
}

export function useCertificateData(classId: string) {
  return useQuery({
    queryKey: ['certificates', classId],
    queryFn: async () => {
      const [templates, students, history] = await Promise.all([
        api.get<{ data: CertificateTemplate[] }>('/certificate-templates'),
        api.get<{ data: CertificateStudent[] }>(`/classes/${classId}/certificates/students`),
        api.get<{ data: CertificateHistoryItem[]; total: number }>(`/classes/${classId}/certificates/history`, { params: { limit: 100 } }),
      ]);
      return { templates: templates.data.data ?? [], students: students.data.data ?? [], history: history.data.data ?? [] };
    },
  });
}

export function useGenerateCertificates(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { templateSlug: string; content: string; students: { studentId: string; studentName: string }[] }) =>
      (await api.post<{ queued: number; batchId: string }>(`/classes/${classId}/certificates/generate`, v)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['certificates', classId] }),
  });
}

export async function certificateStatus(classId: string, templateSlug: string, batchId: string) {
  return (
    await api.get<{ pending: number; generated: number; failed: number; total: number }>(`/classes/${classId}/certificates/status`, {
      params: { templateSlug, batchId },
    })
  ).data;
}

/** Nội dung mặc định trên chứng chỉ — y như web (buildDefaultCertificateContent). */
export function defaultCertificateContent(courseName?: string, issueDate?: string | null) {
  if (!courseName) return '';
  const d = issueDate ? new Date(issueDate) : new Date();
  const safe = Number.isNaN(d.getTime()) ? new Date() : d;
  const monthYear = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(safe);
  return ['Has successfully completed the course', courseName.trim().toUpperCase(), 'with an excellent result', `on ${monthYear} at Uspeak English`].join('\n');
}

// ─── Luyện tập nói ──────────────────────────────────────────────────────────

export interface SpeechLesson {
  _id: string;
  title: string;
  description?: string;
  mode: string;
  input_language: string;
  output_language: string;
  sentences: unknown[];
  is_published: boolean;
  createdAt: string;
}

export interface SpeechSessionItem {
  _id: string;
  lesson_title?: string | null;
  total_score?: number;
  results?: { passed?: boolean }[];
  createdAt?: string;
  user_info: { user_id: string; full_name: string; avatar_url?: string | null };
}

export function usePracticeData(classId: string) {
  return useQuery({
    queryKey: ['speech', 'class', classId],
    queryFn: async () => {
      const [lessons, sessions] = await Promise.all([
        api.get<{ data: SpeechLesson[] }>('/speech/lessons', { params: { class_id: classId } }),
        api.get<{ data: SpeechSessionItem[] }>(`/speech/sessions/class-history/${classId}`, { params: { limit: 500 } }),
      ]);
      return { lessons: (lessons.data.data ?? []).filter((l) => l.mode !== 'translate'), sessions: sessions.data.data ?? [] };
    },
  });
}

export function useImportSpeechLesson(classId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      title: string;
      description?: string;
      input_language: string;
      output_language: string;
      format: 'json' | 'csv';
      sentences?: unknown[];
      csv_text?: string;
      is_published: boolean;
    }) => {
      await api.post('/speech/lessons/import', { class_id: classId, mode: 'drill', ...v });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['speech', 'class', classId] }),
  });
}
