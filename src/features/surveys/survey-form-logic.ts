import type { SurveyAnswer, SurveyField } from './class-survey';

/**
 * Luật của form khảo sát — chép NGUYÊN từ uspeak-class-fe `components/survey/SurveyQuestionForm.tsx`
 * (cùng cách gom nhóm, cùng luật "đã trả lời", cùng định dạng "Khác: <nội dung>"), để phiếu nộp từ
 * app và từ web đọc ra giống nhau ở CRM / Excel.
 */

export type SurveyAnswerMap = Record<string, string | string[]>;

/** Câu hỏi sắp theo `order` như web (CRM trả không bảo đảm đúng thứ tự). */
export function sortSurveyFields(fields: SurveyField[] = []) {
  return [...fields].sort((a, b) => (a.order || 0) - (b.order || 0));
}

/** Các mức của thang điểm, mặc định 1–10. */
export function scaleRange(field: SurveyField) {
  const min = field.scale_min ?? 1;
  const max = field.scale_max ?? 10;
  return Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => String(min + i));
}

/**
 * Lựa chọn "Khác": học viên ghi thêm nội dung, lưu ngay trong giá trị dạng "Khác: <nội dung>"
 * để Excel / trang phản hồi CRM đọc được luôn mà không cần cột riêng.
 */
const OTHER_SEPARATOR = ': ';

export function isOtherOption(opt: { label: string; value: string }) {
  return /^khác\b/i.test(opt.label.trim()) || /^khác\b/i.test(opt.value.trim());
}

export function otherOptionOf(field: SurveyField) {
  return (field.options || []).find(isOtherOption) || null;
}

/** Giá trị đã lưu thuộc lựa chọn nào: "Khác: abc" → { base: "Khác", text: "abc" }. */
export function splitOtherValue(field: SurveyField, value: string) {
  const other = otherOptionOf(field);
  if (other && (value === other.value || value.startsWith(other.value + OTHER_SEPARATOR))) {
    return { base: other.value, text: value.slice(other.value.length + OTHER_SEPARATOR.length) };
  }
  return { base: value, text: '' };
}

export const joinOther = (base: string, text: string) => (text.trim() ? `${base}${OTHER_SEPARATOR}${text}` : base);

/** Đã chọn "Khác" mà chưa ghi nội dung. */
export function otherMissingText(field: SurveyField, value: string | string[] | undefined) {
  const other = otherOptionOf(field);
  if (!other) return false;
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values.some((v) => v === other.value);
}

/** Đã trả lời đủ chưa — thang điểm nhiều mục phải chấm hết mọi mục, chọn "Khác" phải ghi rõ. */
export function isFieldAnswered(field: SurveyField, value: string | string[] | undefined) {
  if (field.type === 'SCALE' && field.scale_items?.length) {
    const values = Array.isArray(value) ? value : [];
    return field.scale_items.every((_, i) => String(values[i] ?? '').trim() !== '');
  }
  if (otherMissingText(field, value)) return false;
  if (Array.isArray(value)) return value.some((v) => String(v ?? '').trim() !== '');
  return String(value ?? '').trim() !== '';
}

/** Câu bắt buộc đầu tiên còn bỏ trống (null = đủ). */
export function findMissingRequired(fields: SurveyField[], answers: SurveyAnswerMap) {
  return fields.find((f) => f.required && !isFieldAnswered(f, answers[f.field_key])) || null;
}

/** Bỏ câu chưa có nội dung trước khi gửi, cắt khoảng trắng 2 đầu câu tự viết (luật của web). */
export function toAnswerList(fields: SurveyField[], answers: SurveyAnswerMap): SurveyAnswer[] {
  return fields
    .filter((f) => {
      const v = answers[f.field_key];
      return Array.isArray(v) ? v.some((x) => String(x ?? '').trim() !== '') : String(v ?? '').trim() !== '';
    })
    .map((f) => {
      const v = answers[f.field_key];
      return { field_key: f.field_key, value: typeof v === 'string' ? v.trim() : v };
    });
}

export function answersToMap(answers: SurveyAnswer[] = []): SurveyAnswerMap {
  return Object.fromEntries(answers.map((a) => [a.field_key, a.value]));
}

export type SurveySection = {
  key: string;
  /** "A" khi tiêu đề dạng "A. Bạn là ai" */
  badge: string;
  title: string;
  fields: { field: SurveyField; no: number }[];
};

/** Gom các câu liền nhau cùng section thành 1 nhóm, số câu đánh liên tục. */
export function groupSurveySections(fields: SurveyField[]): SurveySection[] {
  const sections: SurveySection[] = [];
  sortSurveyFields(fields).forEach((field, index) => {
    const raw = field.section?.trim() || '';
    const last = sections[sections.length - 1];
    if (last && last.key.endsWith(`|${raw}`)) {
      last.fields.push({ field, no: index + 1 });
      return;
    }
    const match = raw.match(/^([A-Z0-9]{1,2})[.)]\s+(.+)$/);
    sections.push({
      key: `${sections.length}|${raw}`,
      badge: match ? match[1] : String(sections.length + 1),
      title: match ? match[2] : raw,
      fields: [{ field, no: index + 1 }],
    });
  });
  return sections;
}

/** Dòng phụ dưới câu hỏi: cách chọn với câu chọn nhiều + gợi ý của admin. */
export function questionNote(field: SurveyField) {
  const notes: string[] = [];
  if (field.type === 'CHECKBOX') {
    notes.push(field.max_select ? `Chọn tối đa ${field.max_select} đáp án` : 'Chọn được nhiều đáp án');
  }
  if (field.hint) notes.push(field.hint);
  return notes.join(' · ');
}

/**
 * Thời gian làm: ưu tiên con số admin ghi trong mô tả ("Khoảng 8 phút"),
 * không có thì ước lượng — câu chọn ~15s, thang điểm ~30s, câu tự viết ~60s.
 */
export function surveyMinutes(fields: SurveyField[] = [], description?: string) {
  const fromText = description?.match(/(\d+)\s*phút/);
  if (fromText) return Number(fromText[1]);
  const seconds = fields.reduce((sum, f) => {
    if (f.type === 'TEXTAREA') return sum + 60;
    if (f.type === 'SCALE') return sum + 30;
    if (f.type === 'TEXT' || f.type === 'URL') return sum + 25;
    return sum + 15;
  }, 0);
  return Math.max(1, Math.round(seconds / 60));
}

/** Bỏ câu "Khoảng N phút." ở đầu mô tả vì đã hiện thành nhãn riêng. */
export function cleanDescription(description?: string) {
  return (description || '').replace(/^\s*Khoảng\s+\d+\s*phút[.,]?\s*/i, '').trim();
}
