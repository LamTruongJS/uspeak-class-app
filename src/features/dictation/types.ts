/**
 * Nghe chép chính tả — cùng dạng dữ liệu với class-fe src/stores/elearning/types.ts (DictationLesson…).
 * Dùng chung cho bài luyện tập E-Learning `listen_dictation` và bài tập Speak Your Mind (`sym`).
 */

export type DictationLevel = 'easy' | 'medium' | 'hard';

export interface DictationSentence {
  /** Câu đúng như trong audio — là đáp án */
  text: string;
  ipa: string;
  vi: string;
  /** Vị trí trong audio cả bài (giây) */
  start: number;
  end: number;
  /** Audio riêng của câu (đã cắt sẵn) */
  audio: string;
  /** Cách viết khác vẫn tính đúng — key là từ trong `text` (chữ thường) */
  accept?: Record<string, string[]>;
}

export interface DictationVocabulary {
  word: string;
  ipa: string;
  pos: string;
  vi: string;
  example: string;
  exampleVi: string;
  audio: string;
}

export interface DictationLesson {
  /** VD "Bài 1" */
  unit: string;
  week: number;
  title: string;
  subtitle: string;
  audio: string;
  duration: number;
  sentences: DictationSentence[];
  vocabulary: DictationVocabulary[];
  sentence_count?: number;
}

/** Bài làm của học viên cho 1 bài nghe */
export interface DictationProgress {
  unit: string;
  level: DictationLevel;
  /** Key là chỉ số câu — mảng chữ theo thứ tự ô (Khó: 1 phần tử là cả câu) */
  answers: Record<string, string[]>;
  checked: number[];
  /** Số lần gợi ý theo câu của lần làm hiện tại (bài tập SYM giới hạn lượt) */
  hints?: Record<string, number>;
  correct: number;
  total: number;
  score: number;
  best_score: number;
  attempts: number;
  completed_at: string | null;
}

/** Bài làm gửi lên — nơi lưu (luyện tập / bài tập SYM) do màn bọc ngoài tự điền. */
export interface DictationSavePayload {
  level: DictationLevel;
  answers?: Record<string, string[]>;
  checked?: number[];
  hints?: Record<string, number>;
  correct?: number;
  total?: number;
  finish?: boolean;
  reset?: boolean;
}

export const LEVEL_LABEL: Record<DictationLevel, string> = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' };
