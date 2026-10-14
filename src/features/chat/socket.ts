import { useEffect } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';

import { API_ORIGIN } from '@/config/env';
import { refreshSession } from '@/lib/api/client';
import { tokenStorage } from '@/lib/auth/token-storage';
import { queryClient } from '@/lib/query-client';
import { useAuthStore } from '@/stores/auth.store';

import { activeRoom } from './active-room';
import { chatKeys, patchMessage, patchRoom, upsertMessage } from './api';

import type { ChatMessage, ChatPoll } from './types';

/**
 * Socket chat (namespace `/chat` của class-be). Server xác thực bằng token trong handshake
 * (`auth.token`) và tự cho user vào MỌI phòng của mình ngay lúc kết nối → chỉ cần nghe
 * `new_message` là cập nhật được cả danh sách phòng lẫn phòng đang mở.
 */
let socket: Socket | null = null;
let authRetries = 0;


export function getChatSocket(): Socket | null {
  return socket;
}

export function connectChatSocket(): Socket {
  if (socket) {
    if (!socket.connected) socket.connect();
    return socket;
  }
  socket = io(`${API_ORIGIN}/chat`, {
    // Hàm này chạy lại ở MỌI lần (re)connect → luôn lấy token mới nhất sau khi refresh.
    auth: (cb) => {
      void tokenStorage.get().then((t) => cb({ token: t?.accessToken }));
    },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  socket.on('connect', () => {
    authRetries = 0;
  });

  // Token hết hạn → server báo auth_error rồi ngắt (không tự reconnect) → refresh rồi nối lại.
  socket.on('auth_error', async () => {
    if (authRetries >= 2) return;
    authRetries += 1;
    const tokens = await refreshSession().catch(() => null);
    if (tokens) socket?.connect();
  });

  return socket;
}

export function disconnectChatSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

/**
 * Chờ socket nối lại (tối đa `timeoutMs`). Trên điện thoại mất sóng vài giây khi vào thang máy,
 * chuyển Wi-Fi ↔ 4G… là chuyện thường — gửi tin lúc đó phải đợi chứ không báo lỗi ngay.
 */
export function waitForConnected(timeoutMs = 8000): Promise<boolean> {
  const s = socket ?? connectChatSocket();
  if (s.connected) return Promise.resolve(true);
  if (!s.active) s.connect();
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      s.off('connect', onConnect);
      resolve(ok);
    };
    const onConnect = () => done(true);
    const timer = setTimeout(() => done(false), timeoutMs);
    s.on('connect', onConnect);
  });
}

/** emit có chờ ack của server (`{ success, data, error }`); đang rớt mạng thì đợi nối lại trước. */
export async function emitWithAck<T = unknown>(
  event: string,
  payload: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<{ success: boolean; data?: T; error?: string }> {
  if (!(await waitForConnected())) return { success: false, error: 'Mất kết nối, vui lòng thử lại.' };
  return new Promise((resolve) => {
    const s = socket;
    if (!s?.connected) {
      resolve({ success: false, error: 'Mất kết nối, vui lòng thử lại.' });
      return;
    }
    s.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: { success: boolean; data?: T; error?: string }) => {
      resolve(err ? { success: false, error: 'Máy chủ không phản hồi, vui lòng thử lại.' } : res);
    });
  });
}

function previewOf(m: ChatMessage) {
  switch (m.message_type) {
    case 'image':
      return '[Hình ảnh]';
    case 'sticker':
      return '[Nhãn dán]';
    case 'voice':
      return '[Tin nhắn thoại]';
    case 'file':
      return `[Tệp] ${m.file_name ?? ''}`;
    case 'video':
      return '[Video]';
    default:
      return m.content;
  }
}

/**
 * Gắn MỘT lần ở layout sau đăng nhập: giữ socket sống, đổ sự kiện vào cache react-query.
 * Màn danh sách phòng và màn phòng chỉ đọc cache → không phải tự quản lý listener.
 */
export function useChatSocketBridge() {
  const userId = useAuthStore((s) => s.user?._id);

  useEffect(() => {
    if (!userId) return;
    const s = connectChatSocket();

    const onNewMessage = (m: ChatMessage) => {
      const roomId = m.room_id;
      if (!roomId) return;
      upsertMessage(roomId, m);
      const mine = m.sender?._id === userId;
      const known = queryClient.getQueryData<unknown[]>(chatKeys.rooms)?.length;
      patchRoom(
        roomId,
        (r) => ({
          ...r,
          last_message: {
            content: previewOf(m),
            message_type: m.message_type,
            created_at: m.created_at,
            sender_id: m.sender?._id,
            sender_name: m.sender?.full_name,
          },
          last_message_at: m.created_at,
          unread_count: mine || activeRoom.id === roomId ? r.unread_count ?? 0 : (r.unread_count ?? 0) + 1,
          has_unread_mention:
            // Chỉ @nhắc ĐÍCH DANH (token @[Tên](id) trong nội dung). Mảng `mentions` bị @Everyone
            // bung ra mọi thành viên → dùng nó thì ai cũng thấy dấu @ (memory chat-everyone-pierces-mute).
            r.has_unread_mention || (!mine && activeRoom.id !== roomId && (m.content ?? '').includes(`](${userId})`)),
        }),
        true,
      );
      // Phòng chưa có trong danh sách (vừa được thêm vào) → tải lại danh sách.
      if (known && !queryClient.getQueryData<{ _id: string }[]>(chatKeys.rooms)?.some((r) => r._id === roomId)) {
        void queryClient.invalidateQueries({ queryKey: chatKeys.rooms });
      }
    };

    const onReacted = (p: { message_id: string; room_id: string; reactions: ChatMessage['reactions'] }) =>
      patchMessage(p.room_id, p.message_id, (m) => ({ ...m, reactions: p.reactions }));
    const onRecalled = (p: { message_id: string; room_id: string; recalled_by: string }) =>
      patchMessage(p.room_id, p.message_id, (m) => ({ ...m, recalled_by: p.recalled_by }));
    const onDeleted = (p: { message_id: string; room_id: string; deleted_by: string }) =>
      patchMessage(p.room_id, p.message_id, (m) => ({ ...m, deleted_by: p.deleted_by, is_deleted: true }));
    const onEdited = (p: { message_id: string; room_id: string; content: string }) =>
      patchMessage(p.room_id, p.message_id, (m) => ({ ...m, content: p.content, is_edited: true }));
    const onPoll = (p: { message_id: string; room_id: string; poll: ChatPoll }) =>
      patchMessage(p.room_id, p.message_id, (m) => ({ ...m, poll: p.poll }));
    const onPinned = (p: { message_id: string; room_id: string; is_pinned: boolean; pinned_at?: string | null }) => {
      patchMessage(p.room_id, p.message_id, (m) => ({ ...m, is_pinned: p.is_pinned, pinned_at: p.pinned_at ?? null }));
      void queryClient.invalidateQueries({ queryKey: chatKeys.pinned(p.room_id) });
    };
    const onRoomChanged = () => void queryClient.invalidateQueries({ queryKey: chatKeys.rooms });

    // Nối lại sau khi rớt mạng → tải lại để không sót tin trong lúc mất kết nối.
    const onReconnect = () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.rooms });
      if (activeRoom.id) void queryClient.invalidateQueries({ queryKey: chatKeys.messages(activeRoom.id) });
    };

    s.on('new_message', onNewMessage);
    s.on('message_reacted', onReacted);
    s.on('message_recalled', onRecalled);
    s.on('message_deleted', onDeleted);
    s.on('message_edited', onEdited);
    s.on('poll_updated', onPoll);
    s.on('message_pinned', onPinned);
    s.on('room_updated', onRoomChanged);
    s.on('room_deleted', onRoomChanged);
    s.io.on('reconnect', onReconnect);

    // App quay lại từ nền: iOS thường đã cắt socket → nối lại + đồng bộ.
    const appSub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (!s.connected) s.connect();
      onReconnect();
    });

    return () => {
      appSub.remove();
      s.off('new_message', onNewMessage);
      s.off('message_reacted', onReacted);
      s.off('message_recalled', onRecalled);
      s.off('message_deleted', onDeleted);
      s.off('message_edited', onEdited);
      s.off('poll_updated', onPoll);
      s.off('message_pinned', onPinned);
      s.off('room_updated', onRoomChanged);
      s.off('room_deleted', onRoomChanged);
      s.io.off('reconnect', onReconnect);
      // Đăng xuất / đổi tài khoản → đóng socket cũ, lần sau nối bằng token mới.
      disconnectChatSocket();
    };
  }, [userId]);
}

/** Component rỗng để gắn bridge vào cây khi đã đăng nhập. */
export function ChatSocketBridge() {
  useChatSocketBridge();
  return null;
}
