// Chép NGUYÊN từ uspeak-class-fe src/app/[locale]/(dashboard)/my-classes/[classId]/renderers/dictation-scoring.ts
// (cùng luật với BE src/elearning/dictation-scoring.ts) — sửa luật chấm thì sửa cả 3 nơi.
import type { DictationLevel, DictationSentence } from './types';

// ─────────────────────────────────────────────────────────────
// Chấm bài nghe chép chính tả — tách khỏi renderer cho dễ đọc.
//   • Dễ / Vừa: câu hiện sẵn, đục lỗ một số từ → học viên điền từng ô
//   • Khó: chép cả câu → so khớp theo từ (LCS) với câu gốc
// Không phân biệt hoa thường, bỏ dấu câu, ’ = ', số = chữ ("6" = "six").
// ─────────────────────────────────────────────────────────────

/** Một từ trong câu gốc, giữ nguyên dấu câu dính hai đầu để hiển thị lại đúng câu */
export interface DictationToken {
  lead: string;
  word: string;
  trail: string;
  /** Có phải ô học viên cần điền không (Dễ / Vừa) */
  blank: boolean;
}

export type WordStatus = 'correct' | 'wrong' | 'missing';

export interface BlankResult {
  answer: string;
  expected: string;
  status: WordStatus;
}

export interface HardResult {
  /** Từng từ học viên gõ — sai/thừa thì `wrong` */
  typed: { word: string; status: 'correct' | 'wrong' }[];
  /** Từng từ của câu gốc — học viên bỏ sót / gõ sai thì `missing` */
  expected: { word: string; status: 'correct' | 'missing' }[];
}

export interface SentenceScore {
  correct: number;
  total: number;
}

/** Từ chức năng — không đục lỗ ở mức Dễ/Vừa, để câu còn khung mà nghe theo */
const FUNCTION_WORDS = new Set(
  (
    'a an the is am are was were be been to of in on at for with and or but so as by from up ' +
    'out my your his her our their its i you he she we they it me him us them this that these those ' +
    'do does did have has had not no can will would there here very ' +
    // từ đệm (Hmm, Er…) — không đáng để học viên điền
    'hmm erm umm'
  ).split(' '),
);

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];

export function normalizeWord(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9']/g, '')
    .replace(/^'+|'+$/g, '');
}

function canonicalNumber(word: string): string {
  const index = NUMBER_WORDS.indexOf(word);
  return index >= 0 ? String(index) : word;
}

/** Học viên gõ `answer` có được tính đúng cho từ `expected` của câu không */
export function wordMatches(answer: string, expected: string, accept?: Record<string, string[]>): boolean {
  const a = normalizeWord(answer);
  const e = normalizeWord(expected);
  if (!a) return false;
  if (a === e || canonicalNumber(a) === canonicalNumber(e)) return true;
  return (accept?.[e] || []).some((alt) => normalizeWord(alt) === a);
}

/** Từ nặng nghĩa — đối tượng để đục lỗ */
function isContentWord(word: string): boolean {
  const w = normalizeWord(word);
  if (!w) return false;
  if (/^\d+$/.test(w)) return true;
  return w.length > 2 && !FUNCTION_WORDS.has(w);
}

/**
 * Tách câu thành từ và đánh dấu ô cần điền.
 * Vừa = mọi từ nặng nghĩa; Dễ = cách một từ nặng nghĩa đục một (ít nhất 1 ô).
 * Câu không có từ nặng nghĩa nào (VD "Yes, it is.") thì đục trên mọi từ — không thì
 * câu đó ra 0 ô, học viên không có gì để làm.
 */
export function tokenize(text: string, level: DictationLevel): DictationToken[] {
  const tokens: DictationToken[] = text
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      const match = raw.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9']*)$/);
      return {
        lead: match?.[1] || '',
        word: match?.[2] || raw,
        trail: match?.[3] || '',
        blank: false,
      };
    });
  if (level === 'hard') return tokens;

  let candidates = tokens.filter((token) => isContentWord(token.word));
  if (candidates.length === 0) candidates = tokens.filter((token) => normalizeWord(token.word));

  candidates.forEach((token, index) => {
    token.blank = level === 'medium' || index % 2 === 0;
  });
  return tokens;
}

export function blankCount(sentence: DictationSentence, level: DictationLevel): number {
  if (level === 'hard') return tokenize(sentence.text, 'hard').length;
  return tokenize(sentence.text, level).filter((token) => token.blank).length;
}

export function scoreBlanks(sentence: DictationSentence, level: DictationLevel, answers: string[]): BlankResult[] {
  return tokenize(sentence.text, level)
    .filter((token) => token.blank)
    .map((token, index) => {
      const answer = (answers[index] || '').trim();
      return {
        answer,
        expected: token.word,
        status: !answer ? 'missing' : wordMatches(answer, token.word, sentence.accept) ? 'correct' : 'wrong',
      };
    });
}

/** Mức Khó: khớp chuỗi con chung dài nhất theo từ giữa bài chép và câu gốc */
export function scoreHard(sentence: DictationSentence, typedText: string): HardResult {
  const expected = tokenize(sentence.text, 'hard').map((token) => token.word);
  const typed = typedText.split(/\s+/).filter((word) => normalizeWord(word));

  const rows = typed.length;
  const cols = expected.length;
  const table: number[][] = Array.from({ length: rows + 1 }, () => new Array(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i][j] = wordMatches(typed[i], expected[j], sentence.accept)
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const typedStatus = typed.map((word) => ({ word, status: 'wrong' as 'correct' | 'wrong' }));
  const expectedStatus = expected.map((word) => ({
    word,
    status: 'missing' as 'correct' | 'missing',
  }));
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (wordMatches(typed[i], expected[j], sentence.accept)) {
      typedStatus[i].status = 'correct';
      expectedStatus[j].status = 'correct';
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }

  return { typed: typedStatus, expected: expectedStatus };
}

export function scoreSentence(sentence: DictationSentence, level: DictationLevel, answers: string[] = []): SentenceScore {
  if (level === 'hard') {
    const result = scoreHard(sentence, answers[0] || '');
    return {
      correct: result.expected.filter((item) => item.status === 'correct').length,
      total: result.expected.length,
    };
  }
  const results = scoreBlanks(sentence, level, answers);
  return {
    correct: results.filter((item) => item.status === 'correct').length,
    total: results.length,
  };
}
