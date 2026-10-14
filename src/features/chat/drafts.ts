import type { ChatMessage } from './types';

/**
 * Bản nháp theo phòng (chữ đang gõ + tin đang trả lời) — thoát phòng rồi quay lại vẫn còn,
 * như Zalo/Messenger. Giữ trong bộ nhớ là đủ: tắt hẳn app thì mất, giống phần lớn app chat.
 * (Bản web phải tự đọc DOM contentEditable mới giữ được — xem memory chat-per-room-draft.)
 */
interface Draft {
  text: string;
  replyTo: ChatMessage | null;
}

const drafts = new Map<string, Draft>();

export function getDraft(roomId: string): Draft {
  return drafts.get(roomId) ?? { text: '', replyTo: null };
}

export function saveDraft(roomId: string, patch: Partial<Draft>) {
  const next = { ...getDraft(roomId), ...patch };
  if (!next.text && !next.replyTo) drafts.delete(roomId);
  else drafts.set(roomId, next);
}
