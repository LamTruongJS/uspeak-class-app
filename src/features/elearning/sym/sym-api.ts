import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';

export interface SymOutlineDraft {
  answers: Record<string, string>;
  updatedAt: string | null;
}

/** Bài nói học viên tự điền của 1 unit — cùng API với web (GET/PUT /elearning/sym/outline-draft). */
export function useSymOutlineDraft(practiceId: string, unit: string) {
  return useQuery({
    queryKey: ['elearning', 'sym-outline-draft', practiceId, unit],
    enabled: !!practiceId && !!unit,
    staleTime: 0,
    queryFn: async (): Promise<SymOutlineDraft> => {
      const res = await api.get<{ data?: Partial<SymOutlineDraft> }>('/elearning/sym/outline-draft', {
        params: { practice_id: practiceId, unit },
      });
      const payload = res.data?.data ?? {};
      return { answers: payload.answers ?? {}, updatedAt: payload.updatedAt ?? null };
    },
  });
}

export async function saveSymOutlineDraft(body: { class_id: string; practice_id: string; unit: string; answers: Record<string, string> }) {
  const res = await api.put<{ data?: Partial<SymOutlineDraft> }>('/elearning/sym/outline-draft', body);
  return res.data?.data?.updatedAt ?? new Date().toISOString();
}

/** Khoá ô điền — trùng với key BE lưu trong `answers` (và với web). */
export function outlineKey(part: number, groupIndex: number, lineIndex: number) {
  return `${part}:${groupIndex}:${lineIndex}`;
}

/** Dòng cho sẵn trọn câu (câu kết bài) — không có ô điền, chỉ hiện chữ. */
export function isFixedLine(line: { prefix: string; hint?: string; suffix?: string }) {
  return !line.hint && !line.suffix && /[.!?]$/.test(line.prefix.trim());
}

/** Ghép prefix + phần học viên điền + suffix thành câu hoàn chỉnh. */
export function composeLine(prefix: string, answer: string, suffix?: string) {
  const filled = [prefix.trim(), answer.trim()].filter(Boolean).join(' ');
  const tail = (suffix || '').trim();
  if (!tail) return filled;
  return /^[.,!?;:]/.test(tail) ? `${filled}${tail}` : `${filled} ${tail}`;
}
