/**
 * Bài tập "Từ Vựng Siêu Tốc đi làm" (`assignment_type.code = 'tvst_business'`, STEP 4–6 tự chấm thang 10)
 * — cùng dạng với class-fe src/stores/assignment/types.ts (TvstBiz*).
 */

/** Bài làm gửi khi nộp — key ô: "p-i" (đoạn-chỗ trống) cho truyện chêm, "i" cho dịch câu / điền chỗ trống */
export interface TvstBizAnswers {
  codeswitch_a: Record<string, string>;
  codeswitch_b: Record<string, string>;
  translation: Record<string, string>;
  gapfill: Record<string, string>;
}
export type TvstSection = keyof TvstBizAnswers;
export type TvstStep = 4 | 5 | 6;

export interface TvstBizResult {
  score: number;
  max_score: number;
  steps: { step: TvstStep; correct: number; total: number }[];
  /** Đúng/sai từng ô theo phần (gần đúng cũng là true) */
  items: Record<TvstSection, Record<string, boolean>>;
  /** Ô được tính đúng nhờ khoan dung (thiếu mạo từ, số nhiều, gõ nhầm 1 ký tự…) */
  near?: Partial<Record<TvstSection, Record<string, true>>>;
  /** Nhận xét câu dịch chưa đạt (AI) */
  notes?: { translation?: Record<string, string> };
}

/** Ô chêm: chưa nộp thì `en` rỗng, chỉ có `length` để vẽ độ rộng ô */
export interface TvstExamBlank {
  en: string;
  vi: string;
  audioVi?: string;
  audioEn?: string;
  length?: number;
}

export interface TvstParagraph {
  /** Chữ của đoạn, mỗi chỗ chêm là một <kw>…</kw> */
  text: string;
  blanks: TvstExamBlank[];
  /** Audio từng phần chữ khi tách `text` theo <kw> — để phát cả bài */
  audioParts?: string[];
}

export interface TvstBizAssignmentUnit {
  unit: string;
  title: string;
  title_vi?: string;
  codeswitch: { vi_en: TvstParagraph[]; en_vi: TvstParagraph[] };
  translation: { en: string; vi: string; audioEn?: string; audioVi?: string }[];
  gapfill: { text: string; answer: string; vi: string; audio?: string; length?: number }[];
  /** Khung cụm từ của STEP 6 (theo ABC — không lộ thứ tự câu) */
  gapfill_bank: string[];
}

export interface TvstBizAssignmentData {
  assignment_id: string;
  class_id: string;
  title: string;
  description: string;
  exercise_title: string;
  max_score: number;
  unit: TvstBizAssignmentUnit;
  /** Bài làm đang lưu: codeswitch_a/b/gapfill → { answers }, translation → { drafts } */
  sections: Partial<Record<TvstSection, Record<string, unknown>>>;
  submitted_at: string | null;
  result: TvstBizResult | null;
  /** Giáo viên đã yêu cầu làm lại — bài mở khoá, giữ bài cũ để sửa */
  redo?: { reason: string } | null;
  attempts?: number;
  /** Đang làm lại: điểm lần nộp trước (vẫn là điểm ghi nhận tới khi nộp lần mới) */
  previous?: { score: number; max_score: number; submitted_at: string | null } | null;
  /** Màn giáo viên: học viên đang làm lại → đang xem bài của lần nộp gần nhất */
  retrying?: boolean;
}

// ─── Bài luyện tập E-Learning `practice_type: tvst_business` (STEP 1–6) ───

export interface TvstBizChunk {
  en: string;
  ipa?: string;
  vi: string;
  audioEn?: string;
  audioVi?: string;
}

/** Một đoạn câu chuyện — STEP 1 (nghe → nói) và STEP 2 (song ngữ) */
export interface TvstBizLine {
  en: string;
  ipa?: string;
  vi: string;
  audioEn?: string;
  audioVi?: string;
  /** Cụm in đậm trong đoạn, theo thứ tự xuất hiện */
  chunks: TvstBizChunk[];
}

export interface TvstBizUnit {
  unit: string;
  title: string;
  title_vi?: string;
  story: TvstBizLine[];
  /** STEP 3 — thẻ cụm từ */
  vocabulary: TvstBizChunk[];
  /** STEP 4 — đáp án (blanks[].en) có sẵn trong nội dung, máy tự so */
  codeswitch?: { vi_en: TvstParagraph[]; en_vi: TvstParagraph[] };
  translation?: { en: string; vi: string; audioEn?: string; audioVi?: string }[];
  gapfill?: { text: string; answer: string; vi: string; audio?: string }[];
}

export interface TvstBizContent {
  units: TvstBizUnit[];
  /** Tài liệu đi kèm bài tập: chỉ STEP 1–3, STEP 4–6 làm ở bài tập tự chấm (giao từ 02/11/2026) */
  material_only?: boolean;
}

/** Bài làm STEP 4–6 của bản luyện tập — lưu theo phần ở /elearning/tvst-business/progress */
export interface TvstPracticeSection {
  answers?: Record<string, string>;
  checked?: boolean;
  mode?: 'check' | 'reveal' | null;
  drafts?: Record<string, string>;
  seen?: number[];
  correct?: number;
  total?: number;
}

export interface TvstBizProgress {
  unit: string;
  sections: Partial<Record<TvstSection, TvstPracticeSection>>;
}
