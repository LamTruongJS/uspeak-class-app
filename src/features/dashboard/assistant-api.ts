import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

/**
 * Trang chủ trợ giảng — GET /classes/assistant-dashboard (class-be gom sẵn từ các nhóm mình hỗ trợ).
 * Kiểu dữ liệu chép từ uspeak-class-fe/src/stores/class/types.ts (AssistantDashboard) — web dùng chung endpoint.
 */

export interface AssistantDashboardGroup {
  group_id: string;
  group_name: string;
  class_id: string;
  class_code: string;
  class_name: string;
  status_class: string;
  course_type: string | null;
  cover_image: string | null;
  teacher_name: string | null;
  student_count: number;
  max_students: number | null;
  total_assignments: number;
  completion_rate: number;
  average_score: number | null;
  attendance_rate: number | null;
  attention_count: number;
  overdue_count: number;
  class_time: string | null;
  next_session: { start: string; end: string; session_number: number } | null;
}

export type AttentionReasonCode = 'overdue' | 'absent' | 'attendance' | 'score';

export interface AssistantAttentionStudent {
  student_id: string;
  name: string;
  avatar: string | null;
  phone: string | null;
  email: string | null;
  group_id: string;
  group_name: string;
  class_id: string;
  class_code: string;
  overdue_count: number;
  overdue_assignments: { _id: string; title: string; submission_deadline: string }[];
  absent_recent: number;
  attendance_rate: number | null;
  average_score: number | null;
  reasons: { code: AttentionReasonCode; label: string }[];
  severity: number;
}

export interface AssistantUpcomingSession {
  class_id: string;
  class_code: string;
  class_name: string;
  teacher_name: string | null;
  start: string;
  end: string;
  session_number: number | null;
  live: boolean;
}

export interface AssistantRecentSession {
  _id: string;
  class_id: string;
  class_code: string;
  class_name: string;
  session_number: number | null;
  topic: string;
  date: string;
  absent: { _id: string; name: string; group_name: string }[];
}

export interface AssistantDashboard {
  generated_at: string;
  summary: {
    groups: number;
    classes: number;
    students: number;
    attention_students: number;
    overdue_submissions: number;
    upcoming_sessions: number;
  };
  groups: AssistantDashboardGroup[];
  attention: AssistantAttentionStudent[];
  upcoming_sessions: AssistantUpcomingSession[];
  recent_sessions: AssistantRecentSession[];
}

const KEY = ['classes', 'assistant-dashboard'] as const;

const fetchDashboard = async (refresh = false) =>
  (await api.get<AssistantDashboard>('/classes/assistant-dashboard', { params: refresh ? { refresh: 1 } : undefined })).data;

export function useAssistantDashboard() {
  return useQuery({ queryKey: KEY, staleTime: 60_000, queryFn: () => fetchDashboard() });
}

/** Kéo để làm mới: bỏ qua cache 60 giây của BE rồi ghi đè dữ liệu đang hiện. */
export function useRefreshAssistantDashboard() {
  const queryClient = useQueryClient();
  return async () => {
    const data = await fetchDashboard(true);
    queryClient.setQueryData(KEY, data);
  };
}

/** Buổi 1 của CRM là buổi khai giảng → buổi N hiển thị là N-1 (luật chung web + app, xem sessions-api). */
export function sessionLabel(n: number | null | undefined) {
  if (!n) return 'Buổi học';
  return n === 1 ? 'Buổi khai giảng' : `Buổi ${n - 1}`;
}
