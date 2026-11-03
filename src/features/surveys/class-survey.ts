import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * Phiếu khảo sát của học viên — copy từ uspeak-class-fe src/stores/survey (types + api + hooks).
 * class-be chỉ là cầu nối sang CRM:
 * - `/survey/student/pending` — phiếu theo lớp (`data`) + phiếu chung (`general`), kèm số chưa làm
 *   `pending` (tổng) / `class_pending` / `general_pending`;
 * - `/survey/student/general` — phiếu khảo sát CHUNG (scope GENERAL, không gắn lớp, mỗi học viên
 *   làm đúng 1 lần: nộp lại CRM trả 409 nên phiếu đã gửi chỉ xem lại, không sửa);
 * - `/survey/templates/:id`, `/survey/responses/check/:templateId?classId=`, `POST /survey/responses`
 *   (phiếu chung thì KHÔNG gửi `class_id`).
 *
 * Phiếu theo lớp nộp lại = CẬP NHẬT câu trả lời cũ (CRM ghi đè theo template + lớp + học viên),
 * nên màn điền luôn nạp sẵn đáp án đã gửi.
 */
export type SurveyFieldType = 'TEXT' | 'TEXTAREA' | 'SELECT' | 'RADIO' | 'CHECKBOX' | 'URL' | 'SCALE';

export interface SurveyFieldOption {
  label: string;
  value: string;
}

export interface SurveyField {
  field_key: string;
  label: string;
  type: SurveyFieldType;
  options?: SurveyFieldOption[];
  required?: boolean;
  order?: number;
  placeholder?: string;
  /** Tên nhóm câu hỏi — các câu LIỀN NHAU cùng section gom 1 khối ("A. Bạn là ai" → huy hiệu "A") */
  section?: string;
  /** Gợi ý của admin, hiện dòng phụ dưới câu hỏi */
  hint?: string;
  /** Câu đắt giá — nhắc học viên viết cụ thể */
  highlight?: boolean;
  /** CHECKBOX: chọn tối đa N (0/null = không giới hạn) */
  max_select?: number | null;
  /** SCALE: thang điểm, mặc định 1–10 */
  scale_min?: number | null;
  scale_max?: number | null;
  /** SCALE: các mục cần chấm; rỗng = chấm 1 điểm (đáp án là chuỗi). Có mục thì đáp án là string[] cùng thứ tự */
  scale_items?: string[];
}

export interface SurveyAnswer {
  field_key: string;
  value: string | string[];
}

export interface SurveyTemplate {
  _id: string;
  title: string;
  description?: string;
  fields: SurveyField[];
  status?: string;
  scope?: 'CLASS' | 'GENERAL';
}

export interface PendingSurveyItem {
  class_id: string;
  class_code: string;
  class_name: string;
  template_id: string;
  template_title: string;
  template_description?: string;
  template_fields: SurveyField[];
  field_count: number;
  submitted: boolean;
  response_id: string | null;
  answers: SurveyAnswer[];
  submitted_at?: string | null;
}

/** Phiếu khảo sát chung — mỗi học viên làm đúng 1 lần, không gắn lớp. */
export interface GeneralSurveyItem {
  template_id: string;
  template_title: string;
  template_description?: string;
  template_fields: SurveyField[];
  field_count: number;
  submitted: boolean;
  response_id: string | null;
  answers: SurveyAnswer[];
  submitted_at?: string | null;
}

export interface StudentPendingSurveyResponse {
  data: PendingSurveyItem[];
  total: number;
  /** Tổng chưa làm (theo lớp + chung) — web dùng cho chấm đỏ menu "Khảo sát" */
  pending: number;
  class_pending?: number;
  general?: GeneralSurveyItem[];
  general_pending?: number;
}

export const surveyKeys = {
  all: ['class-surveys'] as const,
  pending: ['class-surveys', 'pending'] as const,
  general: ['class-surveys', 'general'] as const,
  template: (id: string) => ['class-surveys', 'template', id] as const,
  check: (templateId: string, classId: string) => ['class-surveys', 'check', templateId, classId] as const,
};

/** Tất cả phiếu khảo sát (theo lớp + chung) của mình, cả đã gửi lẫn chưa. */
export function useStudentSurveys(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: surveyKeys.pending,
    staleTime: 60_000,
    enabled: options?.enabled !== false,
    queryFn: async () => (await api.get<StudentPendingSurveyResponse>('/survey/student/pending')).data,
  });
}

/** Phiếu khảo sát chung (mỗi học viên làm 1 lần) + đáp án đã gửi. */
export function useGeneralSurveys(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: surveyKeys.general,
    staleTime: 60_000,
    enabled: options?.enabled !== false,
    queryFn: async () => {
      const res = (await api.get<GeneralSurveyItem[] | { data?: GeneralSurveyItem[] }>('/survey/student/general')).data;
      return Array.isArray(res) ? res : (res?.data ?? []);
    },
  });
}

/** Số phiếu chưa làm của từng nhóm — `class_pending` có thể thiếu ở CRM cũ thì suy từ tổng. */
export function pendingCounts(data: StudentPendingSurveyResponse | undefined) {
  const general = data?.general_pending ?? (data?.general ?? []).filter((g) => !g.submitted).length;
  const total = data?.pending ?? 0;
  return { total, general, class: data?.class_pending ?? Math.max(0, total - general) };
}

export function useSurveyTemplate(templateId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: surveyKeys.template(templateId),
    enabled: options?.enabled !== false && !!templateId,
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<SurveyTemplate>(`/survey/templates/${templateId}`)).data,
  });
}

/** Đã gửi phiếu này cho lớp này chưa + đáp án đã gửi (để nạp sẵn khi sửa). */
export function useSurveySubmission(templateId: string, classId: string) {
  return useQuery({
    queryKey: surveyKeys.check(templateId, classId),
    enabled: !!templateId && !!classId,
    queryFn: async () =>
      (
        await api.get<{ submitted: boolean; response_id: string | null; answers?: SurveyAnswer[] }>(
          `/survey/responses/check/${templateId}`,
          { params: { classId } },
        )
      ).data,
  });
}

/** Gửi phiếu — `class_id` bỏ trống với phiếu khảo sát chung. */
export function useSubmitSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { template_id: string; class_id?: string; answers: SurveyAnswer[] }) =>
      api.post('/survey/responses', input.class_id ? input : { template_id: input.template_id, answers: input.answers }),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: surveyKeys.pending });
      void queryClient.invalidateQueries({ queryKey: surveyKeys.general });
      if (input.class_id) void queryClient.invalidateQueries({ queryKey: surveyKeys.check(input.template_id, input.class_id) });
    },
  });
}
