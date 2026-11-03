import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';

/**
 * Thông tin học viên (admin) — copy từ uspeak-class-fe src/stores/student-info.
 * class-be `/student-info` (quyền STUDENT_INFO_VIEW, admin luôn được): học viên (role ST chính/phụ,
 * trừ ai có AD/TE) + lớp đang học + số phiếu khảo sát; `/student-info/:userId/surveys` = toàn bộ phiếu.
 * Chỉ đọc — web cũng không cho sửa gì ở màn này.
 */

export interface StudentInfoClass {
  _id: string;
  class_code: string;
  class_name: string;
}

export interface StudentInfoRow {
  _id: string;
  no: number;
  name: string;
  email: string;
  /** Lớp đang học (ACTIVE / TRANSFERRED / RETURNED_DEFERRED bên CRM) */
  classes: StudentInfoClass[];
  survey_count: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface StudentInfoList {
  data: StudentInfoRow[];
  pagination: Pagination;
}

export interface StudentSurveyQuestion {
  field_key: string;
  label: string;
  section: string | null;
  type: string;
  highlight: boolean;
  /** Đã chuẩn hoá ở BE: [] = bỏ trống; SCALE có mục → "Mục: điểm" */
  answer: string[];
}

export interface StudentSurvey {
  _id: string;
  title: string;
  /** CLASS | GENERAL */
  scope: string;
  class: StudentInfoClass | null;
  submitted_at: string | null;
  questions: StudentSurveyQuestion[];
}

export interface StudentSurveys {
  student: { _id: string; name: string; email: string };
  surveys: StudentSurvey[];
}

const PAGE_SIZE = 20;

export const studentInfoKeys = {
  list: (search: string) => ['student-info', 'list', search] as const,
  lists: ['student-info', 'list'] as const,
  surveys: (userId: string) => ['student-info', 'surveys', userId] as const,
};

/** Danh sách học viên — cuộn tải thêm thay cho phân trang số của web. */
export function useStudentInfoList(search: string) {
  return useInfiniteQuery({
    queryKey: studentInfoKeys.list(search),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<StudentInfoList>('/student-info', {
          params: { page: pageParam, limit: PAGE_SIZE, search: search || undefined },
        })
      ).data,
    getNextPageParam: (last, pages) => (pages.length < (last.pagination?.totalPages ?? 1) ? pages.length + 1 : undefined),
    placeholderData: (prev) => prev,
  });
}

/** Toàn bộ phiếu khảo sát 1 học viên đã làm (câu hỏi + câu trả lời). */
export function useStudentSurveys(userId: string) {
  return useQuery({
    queryKey: studentInfoKeys.surveys(userId),
    enabled: !!userId,
    queryFn: async () => (await api.get<{ data: StudentSurveys }>(`/student-info/${userId}/surveys`)).data.data,
  });
}

/**
 * Dòng học viên đã có trong cache danh sách — BE không có API lấy 1 học viên, mà API khảo sát không
 * kèm lớp đang học, nên màn chi tiết lấy lớp từ đây (vào thẳng link thì chỉ thiếu khối lớp).
 */
export function useStudentRowFromCache(userId: string): StudentInfoRow | undefined {
  const queryClient = useQueryClient();
  const entries = queryClient.getQueriesData<InfiniteData<StudentInfoList>>({ queryKey: studentInfoKeys.lists });
  for (const [, data] of entries) {
    const row = data?.pages.flatMap((p) => p.data).find((r) => r._id === userId);
    if (row) return row;
  }
  return undefined;
}

/** Gõ xong mới tìm (400ms) như web. */
export function useDebouncedValue(value: string, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Gom các câu liền nhau cùng section thành 1 khối (giống form khảo sát). */
export function groupBySection(questions: StudentSurveyQuestion[]) {
  const groups: { section: string | null; items: { question: StudentSurveyQuestion; index: number }[] }[] = [];
  questions.forEach((question, index) => {
    const last = groups[groups.length - 1];
    if (last && last.section === question.section) last.items.push({ question, index });
    else groups.push({ section: question.section, items: [{ question, index }] });
  });
  return groups;
}
