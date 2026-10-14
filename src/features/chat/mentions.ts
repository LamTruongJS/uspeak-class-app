/**
 * @nhắc tên trong ô soạn tin (TextInput thường, không phải rich editor):
 * - Ô nhập hiện chữ dễ đọc `@Nguyễn An `, đồng thời nhớ danh sách {tên → id} đã chọn.
 * - Lúc gửi mới đổi sang token server hiểu: `@[Nguyễn An](64ab...)`, `@[Everyone](everyone)`.
 * Người dùng xoá/sửa tên trong ô → tên không còn khớp → tự động không thành token (an toàn).
 */

export const EVERYONE_ID = 'everyone';

export interface PickedMention {
  id: string;
  name: string;
}

/** Đang gõ `@abc` ngay trước con trỏ? → trả về query + vị trí dấu @. */
export function activeMentionQuery(text: string, cursor: number): { query: string; start: number } | null {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  // @ phải đứng đầu dòng hoặc sau khoảng trắng (tránh email abc@gmail.com)
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  // Tên người có dấu cách nên cho phép tối đa 3 từ, quá dài thì coi như không gõ mention nữa
  if (query.length > 30 || /\n/.test(query) || query.split(' ').length > 3) return null;
  return { query, start: at };
}

/** Chèn tên đã chọn vào ô nhập, thay cho `@query` đang gõ. */
export function insertMention(text: string, start: number, cursor: number, name: string) {
  const rest = text.slice(cursor);
  // Sau con trỏ đã có dấu cách thì không chèn thêm (tránh "Nguyễn An  xem")
  const next = `${text.slice(0, start)}@${name}${rest.startsWith(' ') ? '' : ' '}${rest}`;
  return { text: next, cursor: start + name.length + 2 };
}

/** Đổi `@Tên` hiển thị → token server. Tên dài trước để "Nguyễn An" không bị "An" nuốt mất. */
export function encodeMentions(text: string, picked: PickedMention[]) {
  let out = text;
  const unique = [...new Map(picked.map((p) => [p.id, p])).values()].sort((a, b) => b.name.length - a.name.length);
  for (const p of unique) {
    const escaped = p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`@${escaped}(?![\\p{L}\\p{N}])`, 'gu'), `@[${p.name}](${p.id})`);
  }
  return out;
}

/** Bỏ dấu để tìm tên không cần gõ dấu: "nguyen" khớp "Nguyễn". */
export function fold(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}
