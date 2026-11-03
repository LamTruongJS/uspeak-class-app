import { router } from 'expo-router';

import { setRoomIntent } from '@/features/chat/room-intent';

import type { FeedbackItem } from './api';

/** Mở phòng chat của báo cáo từ chat; có tin được đánh dấu thì nhảy tới tin đầu (room-intent như màn Ảnh/tệp). */
export function openFeedbackChat(item: Pick<FeedbackItem, 'chatContext'>) {
  const ctx = item.chatContext;
  if (!ctx?.roomId) return;
  const messageId = ctx.messageIds?.[0];
  if (messageId) setRoomIntent({ roomId: ctx.roomId, type: 'jump', messageId });
  router.push({ pathname: '/chat/[roomId]', params: { roomId: ctx.roomId } });
}
