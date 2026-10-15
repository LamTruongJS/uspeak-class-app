import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { uploadMultipart, type LocalFile } from '@/lib/api/upload';

/**
 * Tạo / sửa bài tập — chép luật từ uspeak-class-fe assignments/create/page.tsx, edit/[id]/page.tsx,
 * QuizBuilder.tsx, MultiTaskItemsBuilder.tsx. Sửa luật ở web thì sửa cả đây (cùng payload POST/PATCH).
 *
 * Gồm cả: giao bài Shadowing, bài kiểm tra dựng sẵn, kế thừa bài cũ, nhập quiz từ Excel (quiz-import.ts),
 * lưu tiêu chí thành template, tài liệu đính kèm (field mới ở class-be 15/10/2026).
 */

export interface AssignmentType {
  _id: string;
  code: string;
  label: string;
  description?: string;
}

export type QuizQuestionType = 'single_choice' | 'multiple_choice' | 'speaking' | 'listening';

export interface QuizOption {
  key: string;
  text: string;
}

export interface QuizQuestion {
  key: string;
  type: QuizQuestionType;
  prompt: string;
  points: number;
  explanation?: string;
  options?: QuizOption[];
  correctKeys?: string[];
  referenceText?: string;
  locale?: string;
  passScore?: number;
  audioUrl?: string;
  audioKey?: string;
  audioSource?: 'url' | 'storage';
}

export type SubmissionItemType = 'youtube_video' | 'image_upload';

export interface SubmissionItem {
  key: string;
  label: string;
  type: SubmissionItemType;
  requires_grading: boolean;
  instructions?: string;
  sort_order: number;
}

export interface Criteria {
  id: string;
  name: string;
  maxScore: number;
  description: string;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

/** Dữ liệu GET /assignments/:id/edit-detail (chỉ field form dùng). */
export interface EditableAssignment {
  _id: string;
  class_id: string;
  assignment_type_id: string;
  title: string;
  description?: string;
  review_requirement?: string;
  grading_rubric?: string;
  grading_criteria?: { name: string; max_score: number; description?: string }[];
  allow_late_submission?: boolean;
  requires_grading?: boolean;
  difficulty?: Difficulty;
  required_duration_minutes?: number;
  grading_duration_minutes?: number;
  session_number?: string;
  quiz_questions?: QuizQuestion[];
  submission_items?: SubmissionItem[];
  submission_deadline?: string | null;
  grading_deadline?: string | null;
  scheduled_publish_at?: string | null;
  is_published?: boolean;
  shadowing?: unknown;
  test_template?: string;
  attachments?: AssignmentAttachment[];
}

export const TYPE_LOOK: Record<string, { icon: string; color: string; hint: string }> = {
  video_speaking: { icon: 'videocam', color: '#7c3aed', hint: 'Nộp link video — phổ biến nhất' },
  youtube_video: { icon: 'logo-youtube', color: '#dc2626', hint: 'Nộp link YouTube' },
  quiz: { icon: 'help-circle', color: '#0891b2', hint: 'Trắc nghiệm, tự chấm điểm' },
  essay: { icon: 'create', color: '#ea580c', hint: 'Bài viết, review sâu' },
  image_upload: { icon: 'image', color: '#db2777', hint: 'Học viên chụp ảnh bài làm' },
  multi_task: { icon: 'list', color: '#059669', hint: 'Nhiều mục nộp (video + ảnh)' },
  shadowing: { icon: 'pulse', color: '#b62025', hint: 'Giao từ thư viện Shadowing' },
};

// ─── Quiz ───────────────────────────────────────────────────────────────────

const QUIZ_TOTAL_POINTS = 10;
const QUIZ_POINT_SCALE = 100;

export const QUESTION_TYPES: { value: QuizQuestionType; label: string }[] = [
  { value: 'single_choice', label: 'Chọn 1' },
  { value: 'multiple_choice', label: 'Chọn nhiều' },
  { value: 'speaking', label: 'Speaking' },
  { value: 'listening', label: 'Listening' },
];

export const uid = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-3)}`;

/** Chia đều 10 điểm cho các câu (làm tròn 2 số, phần dư cộng vào các câu đầu) — y như web. */
export function distributeQuizPoints(questions: QuizQuestion[]) {
  if (!questions.length) return [];
  const totalUnits = QUIZ_TOTAL_POINTS * QUIZ_POINT_SCALE;
  const baseUnits = Math.floor(totalUnits / questions.length);
  const remainder = totalUnits - baseUnits * questions.length;
  return questions.map((q, i) => ({ ...q, points: Number(((baseUnits + (i < remainder ? 1 : 0)) / QUIZ_POINT_SCALE).toFixed(2)) }));
}

export function newQuestion(type: QuizQuestionType = 'single_choice'): QuizQuestion {
  if (type === 'speaking') return { key: uid('q'), type, prompt: '', points: 1, referenceText: '', locale: 'en-US', passScore: 80 };
  const first = uid('opt');
  const options = [
    { key: first, text: '' },
    { key: uid('opt'), text: '' },
  ];
  if (type === 'listening') return { key: uid('q'), type, prompt: '', points: 1, audioSource: 'url', audioUrl: '', audioKey: '', options, correctKeys: [first] };
  return { key: uid('q'), type, prompt: '', points: 1, options, correctKeys: [first] };
}

export function sanitizeQuizQuestions(questions: QuizQuestion[]) {
  return distributeQuizPoints(questions).map((q) => {
    if (q.type === 'speaking') {
      return {
        key: q.key,
        type: q.type,
        prompt: q.prompt.trim(),
        points: Number(q.points || 0),
        explanation: q.explanation?.trim() || '',
        referenceText: q.referenceText?.trim() || '',
        locale: q.locale?.trim() || 'en-US',
        passScore: Number(q.passScore ?? 80),
      };
    }
    const options = (q.options || []).filter((o) => o.text.trim());
    const keys = new Set(options.map((o) => o.key));
    return {
      key: q.key,
      type: q.type,
      prompt: q.prompt.trim(),
      points: Number(q.points || 0),
      explanation: q.explanation?.trim() || '',
      options,
      correctKeys: (q.correctKeys || []).filter((k) => keys.has(k)),
      ...(q.type === 'listening'
        ? { audioUrl: q.audioUrl?.trim() || '', audioKey: q.audioKey?.trim() || '', audioSource: q.audioKey ? 'storage' : q.audioSource || 'url' }
        : {}),
    };
  });
}

export function quizErrors(questions: QuizQuestion[]) {
  const cleaned = sanitizeQuizQuestions(questions);
  const errors: string[] = [];
  if (!cleaned.length) errors.push('Quiz cần ít nhất 1 câu hỏi');
  cleaned.forEach((q, i) => {
    const n = `Câu ${i + 1}`;
    if (!q.prompt.trim()) errors.push(`${n}: chưa có đề bài`);
    if (q.type === 'speaking') {
      if (!q.referenceText?.trim()) errors.push(`${n}: thiếu câu mẫu`);
      return;
    }
    if (q.type === 'listening' && !q.audioUrl?.trim() && !q.audioKey?.trim()) errors.push(`${n}: thiếu audio listening`);
    if ((q.options || []).length < 2) errors.push(`${n}: cần ít nhất 2 đáp án`);
    if (!(q.correctKeys || []).length) errors.push(`${n}: chưa chọn đáp án đúng`);
    if (q.type === 'single_choice' && (q.correctKeys || []).length > 1) errors.push(`${n}: chọn 1 chỉ được tick 1 đáp án`);
  });
  return errors;
}

// ─── Nhiều mục ──────────────────────────────────────────────────────────────

export const MULTI_TASK_MAX_ITEMS = 20;

export const newItem = (sort: number): SubmissionItem => ({
  key: uid('item'),
  label: '',
  type: 'youtube_video',
  requires_grading: true,
  instructions: '',
  sort_order: sort,
});

export function multiTaskErrors(items: SubmissionItem[]) {
  if (!items.length) return ['Cần ít nhất 1 mục nộp'];
  const errors: string[] = [];
  if (items.length > MULTI_TASK_MAX_ITEMS) errors.push(`Tối đa ${MULTI_TASK_MAX_ITEMS} mục`);
  items.forEach((it, i) => !it.label.trim() && errors.push(`Mục #${i + 1} chưa có tên`));
  return errors;
}

// ─── Tiêu chí chấm ─────────────────────────────────────────────────────────

/** Tiêu chí từ bài cũ: ưu tiên grading_criteria; bài rất cũ chỉ có chuỗi grading_rubric "Tên (N điểm): mô tả". */
export function criteriaFrom(a: Pick<EditableAssignment, 'grading_criteria' | 'grading_rubric'>): Criteria[] {
  if (a.grading_criteria?.length) {
    return a.grading_criteria.map((c, i) => ({ id: String(i), name: c.name, maxScore: c.max_score, description: c.description || '' }));
  }
  return (a.grading_rubric ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const m = line.match(/^(.+?)\s*\((\d+)\s*điểm\)\s*:\s*(.+)$/);
      if (m) return { id: String(i), name: m[1].trim(), maxScore: Number(m[2]), description: m[3].trim() };
      const s = line.match(/^(.+?)\s*:\s*(.+)$/);
      return s ? { id: String(i), name: s[1].trim(), maxScore: 10, description: s[2].trim() } : null;
    })
    .filter((c): c is Criteria => !!c);
}

// ─── API ────────────────────────────────────────────────────────────────────

export function useAssignmentTypes() {
  return useQuery({
    queryKey: ['assignments', 'types'],
    staleTime: 10 * 60_000,
    queryFn: async () => (await api.get<{ data: AssignmentType[] }>('/assignments/types')).data.data ?? [],
  });
}

export interface RubricTemplate {
  _id: string;
  name: string;
  criteria: { name: string; max_score: number; description?: string }[];
}

export function useRubricTemplates() {
  return useQuery({
    queryKey: ['assignments', 'rubric-templates'],
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<{ data: RubricTemplate[] }>('/assignments/rubric-templates')).data.data ?? [],
  });
}

export function useEditableAssignment(id: string) {
  return useQuery({
    queryKey: ['assignments', 'edit-detail', id],
    enabled: !!id,
    gcTime: 0,
    queryFn: async () => (await api.get<{ data: EditableAssignment }>(`/assignments/${id}/edit-detail`)).data.data,
  });
}

export function useSaveAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id?: string; payload: Record<string, unknown> }) => {
      if (v.id) await api.patch(`/assignments/${v.id}`, v.payload);
      else await api.post('/assignments', v.payload);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assignments'] }),
  });
}

/** Số bài đã nộp (đúng hạn + muộn) — đổi bài "không cần chấm" sang "cần chấm" phải hỏi lại như web. */
export async function countSubmissions(id: string) {
  const res = (await api.get<{ on_time?: unknown[]; late?: unknown[] }>(`/assignments/${id}/submission-breakdown`)).data;
  return (res.on_time?.length ?? 0) + (res.late?.length ?? 0);
}

export async function uploadQuizAudio(file: LocalFile) {
  return (await uploadMultipart<{ data: { key: string; url: string } }>('/assignments/upload-quiz-audio', { audio: file })).data;
}

// ─── Tài liệu đính kèm (class-be thêm 15/10/2026: POST /assignments/upload-files + field `attachments`) ───

export interface AssignmentAttachment {
  key: string;
  name: string;
  type: string;
  size: number;
  url?: string;
}

export async function uploadAssignmentFiles(files: LocalFile[]) {
  return (await uploadMultipart<{ data: AssignmentAttachment[] }>('/assignments/upload-files', { files })).data ?? [];
}

// ─── Template tiêu chí ──────────────────────────────────────────────────────

export function useCreateRubricTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; criteria: { name: string; max_score: number; description: string }[] }) => {
      await api.post('/assignments/rubric-templates', body);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assignments', 'rubric-templates'] }),
  });
}

// ─── Kế thừa bài có sẵn (cùng loại bài, mọi lớp) ─────────────────────────────

export interface InheritableAssignment {
  _id: string;
  title: string;
  class_name?: string;
  class_code?: string;
  created_at?: string;
}

export function useInheritableAssignments(typeId: string, search: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['assignments', 'inheritable', typeId, search],
    enabled: enabled && !!typeId,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<{ data: InheritableAssignment[]; pagination?: { page: number; totalPages: number; hasNextPage?: boolean } }>('/assignments', {
          params: { page: pageParam, limit: 30, assignment_type_id: typeId, search: search || undefined },
        })
      ).data,
    getNextPageParam: (last) => {
      const p = last.pagination;
      return p && p.page < p.totalPages ? p.page + 1 : undefined;
    },
  });
}

export async function fetchEditableAssignment(id: string) {
  return (await api.get<{ data: EditableAssignment }>(`/assignments/${id}/edit-detail`)).data.data;
}

// ─── Bài kiểm tra dựng sẵn (bản rút gọn của uspeak-class-fe constants/class-tests.ts) ──────────

/**
 * Chỉ giữ field form tạo bài cần. Đề đầy đủ (câu hỏi, audio, đồng hồ) nằm ở web và màn làm bài
 * đọc theo `test_template` — thêm mẫu mới ở web thì thêm cả dòng tương ứng ở đây.
 */
export const CLASS_TEST_TEMPLATES = [
  {
    code: 'eet_speaking',
    name: 'Bài kiểm tra lớp EET',
    badge: 'LỚP EET',
    assignmentTitle: 'BÀI KIỂM TRA LỚP EET - ENGLISH SPEAKING TEST',
    summary: '10 câu hỏi nói, 45 giây/câu (tổng 7 phút 30 giây). Học viên quay video toàn bộ quá trình rồi nộp link.',
    durationMinutes: 15,
    descriptionHtml: [
      '<p><strong>ENGLISH SPEAKING TEST — 10 câu hỏi, 45 giây/câu, tổng 7 phút 30 giây.</strong></p>',
      '<p>Học viên nghe từng câu hỏi và trả lời bằng tiếng Anh, quay video toàn bộ quá trình làm bài (cả phần nghe câu hỏi lẫn phần trả lời), sau đó nộp link video cho giáo viên.</p>',
      '<p>Mở bài tập để xem đề đầy đủ và làm bài.</p>',
    ].join(''),
  },
];

// ─── Shadowing (giao từ thư viện Shadowing — ShadowingAssignmentForm web) ───────────────────

export interface ShadowingCourse {
  courseId: string;
  title: string;
  level: string | null;
  totalParts: number;
  unitCount: number;
}

export interface ShadowingUnit {
  unitId: string;
  name: string;
  sequence: number;
  parts: { partId: string; title: string; sequence: number; durationSec: number; segmentCount: number }[];
}

export function useShadowingCourses(enabled: boolean) {
  return useQuery({
    queryKey: ['shadowing-catalog-courses'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<{ data: ShadowingCourse[] }>('/assignments/shadowing/catalog/courses')).data.data ?? [],
  });
}

export function useShadowingCourse(courseId: string) {
  return useQuery({
    queryKey: ['shadowing-catalog-course', courseId],
    enabled: !!courseId,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (await api.get<{ data: { courseId: string; title: string; units: ShadowingUnit[] } }>(`/assignments/shadowing/catalog/courses/${encodeURIComponent(courseId)}`)).data
        .data,
  });
}

export function useCreateShadowingAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      class_id: string;
      title?: string;
      description?: string;
      unit_ids?: string[];
      part_ids?: string[];
      submission_deadline: string;
      min_accuracy: number;
      dictation_difficulty: Difficulty;
      session_number?: string;
    }) => {
      await api.post('/assignments/shadowing', payload);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['assignments'] }),
  });
}
