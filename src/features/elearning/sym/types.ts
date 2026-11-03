/**
 * Kiểu dữ liệu bài Speak Your Mind — chép từ class-fe `stores/elearning/types.ts` (Sym*).
 * Nội dung nằm trong `practice_lesson.content.units` (lớp giữ bản chép của thư viện).
 */

/** Vùng trên tranh mà câu nói tới, tính theo % (gốc trên-trái). Không có = cả tranh. */
export interface SymFocus {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SymSample {
  en: string;
  ipa: string;
  vi: string;
  audioEn?: string;
  audioVi?: string;
  focus?: SymFocus | null;
}

export interface SymStructure {
  label: string;
  pattern: string;
  ipa?: string;
  meaningVi?: string;
  note?: string;
  focus?: SymFocus | null;
  samples: SymSample[];
}

export interface SymVocabularyItem {
  group?: string;
  word: string;
  ipa: string;
  vi: string;
  audio?: string;
  audioVi?: string;
  focus?: SymFocus | null;
}

export interface SymPart {
  order: number;
  title: string;
  titleVi?: string;
  instruction?: string;
  structures: SymStructure[];
  vocabularyTitle?: string;
  vocabulary?: SymVocabularyItem[];
  tip?: string;
}

export interface SymOutlineLine {
  prefix: string;
  suffix?: string;
  hint?: string;
  focus?: SymFocus | null;
}

export interface SymOutlineGroup {
  label?: string;
  lines: SymOutlineLine[];
}

export interface SymOutlineSection {
  part: number;
  title: string;
  groups: SymOutlineGroup[];
}

export interface SymUnit {
  unit: string;
  title: string;
  subtitle?: string;
  picture?: {
    imageUrl?: string;
    title?: string;
    quickScanNote?: string;
    peopleHints?: { label: string; position: string }[];
  };
  parts: SymPart[];
  outline?: SymOutlineSection[];
}

export interface SymContent {
  units?: SymUnit[];
}
