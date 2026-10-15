import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { newQuestion, uid, type QuizQuestion, type QuizQuestionType } from './api';

/**
 * Nhập câu hỏi quiz từ Excel — CÙNG định dạng file với web (QuizBuilder: rowToQuestion, IMPORT_HEADERS),
 * nên file mẫu tải từ web hay từ app đều dùng chung được. Sửa cột / luật ở web thì sửa cả đây.
 *
 * `xlsx` (~1MB JS) chỉ CHẠY lúc bấm nút (require trong hàm): vẫn nằm trong gói nhưng không khởi tạo lúc mở app.
 * Không dùng `import()` động — Expo Go (dev) báo "Requiring unknown module" với gói tách lazy.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const loadXlsx = async (): Promise<typeof import('xlsx')> => require('xlsx');
const OPTION_HEADERS = ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D', 'Đáp án E', 'Đáp án F'];
export const IMPORT_HEADERS = [
  'Loại',
  'Câu hỏi',
  ...OPTION_HEADERS,
  'Đáp án đúng',
  'Giải thích',
  'Audio URL',
  'Câu mẫu speaking',
  'Ngôn ngữ',
  'Điểm đạt speaking',
];

const TYPE_ALIASES: Record<string, QuizQuestionType> = {
  single_choice: 'single_choice',
  'chon 1': 'single_choice',
  'chọn 1': 'single_choice',
  multiple_choice: 'multiple_choice',
  'chon nhieu': 'multiple_choice',
  'chọn nhiều': 'multiple_choice',
  speaking: 'speaking',
  listening: 'listening',
};

const cell = (row: Record<string, unknown>, header: string) => String(row[header] ?? '').trim();

function correctIndexes(value: string, count: number) {
  if (!value.trim()) return [];
  return value
    .split(/[;,]/)
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean)
    .map((p) => (/^[A-F]$/.test(p) ? p.charCodeAt(0) - 65 : /^[1-6]$/.test(p) ? Number(p) - 1 : -1))
    .filter((i, pos, arr) => i >= 0 && i < count && arr.indexOf(i) === pos);
}

function rowToQuestion(row: Record<string, unknown>, n: number): { errors: string[]; question?: QuizQuestion } {
  const errors: string[] = [];
  const type = TYPE_ALIASES[cell(row, 'Loại').toLowerCase().replace(/\s+/g, ' ')];
  const prompt = cell(row, 'Câu hỏi');
  const explanation = cell(row, 'Giải thích');
  if (!type) errors.push(`Dòng ${n}: Loại không hợp lệ (single_choice, multiple_choice, speaking, listening).`);
  if (!prompt) errors.push(`Dòng ${n}: thiếu Câu hỏi.`);
  if (!type || !prompt) return { errors };

  const base = newQuestion(type);
  if (type === 'speaking') {
    const referenceText = cell(row, 'Câu mẫu speaking');
    if (!referenceText) errors.push(`Dòng ${n}: speaking cần Câu mẫu speaking.`);
    return {
      errors,
      question: { ...base, prompt, explanation, referenceText, locale: cell(row, 'Ngôn ngữ') || 'en-US', passScore: Number(cell(row, 'Điểm đạt speaking') || 80) },
    };
  }

  const options = OPTION_HEADERS.map((h) => cell(row, h))
    .filter(Boolean)
    .map((text) => ({ key: uid('opt'), text }));
  const correctKeys = correctIndexes(cell(row, 'Đáp án đúng'), options.length)
    .map((i) => options[i]?.key)
    .filter((k): k is string => !!k);
  if (options.length < 2) errors.push(`Dòng ${n}: cần ít nhất 2 đáp án.`);
  if (!correctKeys.length) errors.push(`Dòng ${n}: thiếu Đáp án đúng (vd A hoặc A,C).`);
  if ((type === 'single_choice' || type === 'listening') && correctKeys.length > 1) {
    errors.push(`Dòng ${n}: ${type === 'single_choice' ? 'Chọn 1' : 'Listening'} chỉ được 1 đáp án đúng.`);
  }
  if (type === 'listening') {
    const audioUrl = cell(row, 'Audio URL');
    if (!audioUrl) errors.push(`Dòng ${n}: listening cần Audio URL.`);
    return { errors, question: { ...base, prompt, explanation, audioSource: 'url', audioUrl, audioKey: '', options, correctKeys: correctKeys.slice(0, 1) } };
  }
  return { errors, question: { ...base, prompt, explanation, options, correctKeys: type === 'single_choice' ? correctKeys.slice(0, 1) : correctKeys } };
}

/** Chọn file .xlsx → câu hỏi. `null` = người dùng huỷ chọn file. */
export async function pickQuizExcel(): Promise<{ questions: QuizQuestion[]; errors: string[] } | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '*/*'],
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets[0]) return null;
  const [XLSX, buffer] = await Promise.all([loadXlsx(), new File(res.assets[0].uri).arrayBuffer()]);
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const questions: QuizQuestion[] = [];
  const errors: string[] = [];
  rows.forEach((row, i) => {
    if (!IMPORT_HEADERS.some((h) => cell(row, h))) return;
    const r = rowToQuestion(row, i + 2);
    errors.push(...r.errors);
    if (r.question) questions.push(r.question);
  });
  return { questions, errors };
}

/** Tạo file mẫu (cột + 4 dòng ví dụ) rồi mở bảng chia sẻ của máy để lưu / gửi sang máy tính. */
export async function shareQuizTemplate() {
  const XLSX = await loadXlsx();
  const sample = [
    { Loại: 'single_choice', 'Câu hỏi': 'She ___ to school every day.', 'Đáp án A': 'go', 'Đáp án B': 'goes', 'Đáp án C': 'going', 'Đáp án đúng': 'B', 'Giải thích': 'Chủ ngữ số ít → goes' },
    { Loại: 'multiple_choice', 'Câu hỏi': 'Chọn các từ là động từ', 'Đáp án A': 'run', 'Đáp án B': 'happy', 'Đáp án C': 'eat', 'Đáp án đúng': 'A,C' },
    { Loại: 'speaking', 'Câu hỏi': 'Đọc to câu sau', 'Câu mẫu speaking': 'I usually go to work by bus.', 'Ngôn ngữ': 'en-US', 'Điểm đạt speaking': 80 },
    { Loại: 'listening', 'Câu hỏi': 'Người nói đang ở đâu?', 'Đáp án A': 'At home', 'Đáp án B': 'At school', 'Đáp án đúng': 'A', 'Audio URL': 'https://…/audio.mp3' },
  ];
  const ws = XLSX.utils.json_to_sheet(sample, { header: IMPORT_HEADERS });
  ws['!cols'] = IMPORT_HEADERS.map((h) => ({ wch: h === 'Câu hỏi' || h === 'Câu mẫu speaking' ? 36 : 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Quiz');
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const file = new File(Paths.cache, 'mau-import-cau-hoi-quiz.xlsx');
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(bytes));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'File mẫu câu hỏi quiz',
    UTI: 'org.openxmlformats.spreadsheetml.sheet',
  });
}
