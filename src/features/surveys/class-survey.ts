import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * Phiếu khảo sát của lớp (học viên điền) — copy từ uspeak-class-fe src/stores/survey.
 * class-be chỉ là cầu nối sang CRM: `/survey/student/pending`, `/survey/templates/:id`,
 * `/survey/responses/check/:templateId?classId=`, `POST /survey/responses`.
 *
 * Nộp lại cùng một phiếu = CẬP NHẬT câu trả lời cũ (CRM ghi đè theo template + lớp + học viên),
 * nên màn điền luôn nạp sẵn đáp án đã gửi.
 */
export type SurveyFieldType = 'TEXT' | 'TEXTAREA' | 'SELECT' | 'RADIO' | 'CHECKBOX' | 'URL';

export interface SurveyField {
  field_key: string;
  label: string;
  type: SurveyFieldType;
  options?: { label: string; value: string }[];
  required?: boolean;
  order?: number;
  placeholder?: string;
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

export const surveyKeys = {
  pending: ['class-surveys', 'pending'] as const,
  template: (id: string) => ['class-surveys', 'template', id] as const,
  check: (templateId: string, classId: string) => ['class-surveys', 'check', templateId, classId] as const,
};

/** Tất cả phiếu khảo sát của các lớp mình đang học (cả đã gửi lẫn chưa). */
export function useStudentSurveys() {
  return useQuery({
    queryKey: surveyKeys.pending,
    staleTime: 60_000,
    queryFn: async () =>
      (await api.get<{ data: PendingSurveyItem[]; total: number; pending: number }>('/survey/student/pending')).data,
  });
}

export function useSurveyTemplate(templateId: string) {
  return useQuery({
    queryKey: surveyKeys.template(templateId),
    enabled: !!templateId,
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

export function useSubmitSurvey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { template_id: string; class_id: string; answers: SurveyAnswer[] }) =>
      api.post('/survey/responses', input),
    onSuccess: (_data, input) => {
      void queryClient.invalidateQueries({ queryKey: surveyKeys.pending });
      void queryClient.invalidateQueries({ queryKey: surveyKeys.check(input.template_id, input.class_id) });
    },
  });
}

/** Câu hỏi sắp theo `order` như web (CRM trả không bảo đảm đúng thứ tự). */
export function sortedFields(fields: SurveyField[] | undefined) {
  return [...(fields ?? [])].sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function isAnswered(value: string | string[] | undefined) {
  if (!value) return false;
  return Array.isArray(value) ? value.length > 0 : value.trim().length > 0;
}

/** Bỏ câu chưa trả lời trước khi gửi (luật của web: chỉ gửi câu có nội dung). */
export function toAnswerList(answers: Record<string, string | string[]>): SurveyAnswer[] {
  return Object.entries(answers)
    .filter(([, value]) => isAnswered(value))
    .map(([field_key, value]) => ({ field_key, value }));
}
