import { formatDate, formatTime, isSameDay, WEEKDAY_SHORT } from '@/lib/format';

import type { ChatRoomItem } from './types';

/** Tên hiển thị của phòng: chat 1-1 thì là tên người kia. */
export function roomTitle(r: Pick<ChatRoomItem, 'type' | 'name' | 'direct_recipient'>) {
  return r.type === 'direct' && r.direct_recipient && !r.direct_recipient.is_multi ? r.direct_recipient.full_name : r.name;
}

/** Token @nhắc tên trong nội dung: `@[Tên hiển thị](userId)` (class-be lưu dạng này). */
export const MENTION_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/** Nội dung để hiện dạng chữ thường (xem trước, sao chép): bỏ cú pháp mention. */
export function plainContent(content?: string | null) {
  return (content || '').replace(MENTION_RE, '@$1');
}

export type ContentPart =
  | { kind: 'text'; text: string }
  | { kind: 'mention'; text: string; userId: string }
  | { kind: 'link'; text: string };

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;

/**
 * Gộp dòng trống thừa như web (class-fe utils/chat-text.ts, 04/11/2026): ô soạn tin web từng đếm 1 dòng
 * trống thành 2–3, tin cũ còn lưu nguyên → dòng chỉ có khoảng trắng coi là trống, tối đa 1 dòng trống
 * liên tiếp, bỏ dòng trống đầu/cuối. Không đụng khoảng trắng TRONG một dòng.
 */
export function normalizeChatLineBreaks(text: string) {
  if (!text) return text;
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => (/^[\s\u00a0\u200b\u200c\u200d\ufeff]*$/.test(line) ? '' : line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

/** Tách nội dung thành đoạn chữ / @nhắc tên / link để tô màu & bấm được. */
export function parseContent(content?: string | null): ContentPart[] {
  const parts: ContentPart[] = [];
  const src = normalizeChatLineBreaks(content || '');
  let last = 0;
  for (const m of src.matchAll(MENTION_RE)) {
    if (m.index! > last) pushText(parts, src.slice(last, m.index));
    parts.push({ kind: 'mention', text: `@${m[1]}`, userId: m[2] });
    last = m.index! + m[0].length;
  }
  if (last < src.length) pushText(parts, src.slice(last));
  return parts;
}

function pushText(parts: ContentPart[], text: string) {
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index! > last) parts.push({ kind: 'text', text: text.slice(last, m.index) });
    parts.push({ kind: 'link', text: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
}

/** Giờ ở danh sách phòng: hôm nay → 14:05, trong tuần → T3, xa hơn → 12/10/2026. */
export function roomTime(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (isSameDay(d, now)) return formatTime(d);
  const days = (now.getTime() - d.getTime()) / 86_400_000;
  if (days < 6) return WEEKDAY_SHORT[d.getDay()];
  // Cùng năm thì bỏ năm cho gọn ("06/10"), khác năm mới ghi đủ
  return d.getFullYear() === now.getFullYear() ? formatDate(d).slice(0, 5) : formatDate(d);
}

/** Nhãn ngăn cách ngày trong luồng tin. */
export function dayLabel(d: Date) {
  const now = new Date();
  if (isSameDay(d, now)) return 'Hôm nay';
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (isSameDay(d, y)) return 'Hôm qua';
  return `${WEEKDAY_SHORT[d.getDay()]}, ${formatDate(d)}`;
}
