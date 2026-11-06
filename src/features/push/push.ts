import type * as NotificationsModule from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { activeRoom } from '@/features/chat/active-room';
import { useUnreadRoomKey, useUnreadTotal } from '@/features/chat/api';
import { useInvalidateNotifications, useUnreadNotificationCount } from '@/features/notifications/api';

import { dismissByTags, readPayload } from './background';
import { Notifications, registerForPush, watchPushToken } from './push-token';

export { unregisterPush } from './push-token';

/**
 * Thông báo đẩy (push) — class-be gửi ở `ExpoPushService` (iOS qua Expo Push, Android thẳng FCM)
 * (uspeak-class-be/src/push/expo-push.service.ts) tại đúng các điểm Web Push đang gửi
 * (tin chat, thông báo phòng) + thông báo trong app (bài mới, đã chấm, yêu cầu làm lại).
 *
 * data trong push (kèm `tag`: `chat:<roomId>` | `chat-announcement:<id>` | `noti:<related_id>`):
 *  - { kind: 'chat', room_id }                        → mở phòng chat
 *  - { kind: 'notification', related_type, related_id } → 'assignment' mở bài, 'submission' mở kết quả
 *
 * Đọc ở web/máy khác → push ngầm, xử lý ở background.ts. Nút Trả lời / Đã đọc cũng ở background.ts.
 */

// App đang mở mà nhận push: đang xem đúng phòng đó thì im lặng (tin đã hiện trong luồng chat),
// push ngầm "đã đọc" cũng không hiện; còn lại vẫn hiện banner như Zalo/Messenger.
Notifications?.setNotificationHandler({
  handleNotification: async (n) => {
    const data = readPayload(n.request.content.data);
    const roomId = data.room_id;
    const viewingRoom = !!roomId && roomId === activeRoom.id && AppState.currentState === 'active';
    const hide = data.type === 'sync' || viewingRoom;
    return { shouldShowBanner: !hide, shouldShowList: !hide, shouldPlaySound: !hide, shouldSetBadge: !hide };
  },
});

/** Mở đúng màn theo data của thông báo. */
function openFromPush(data: Record<string, unknown>) {
  if (data.kind === 'chat' && typeof data.room_id === 'string') {
    router.push({ pathname: '/chat/[roomId]', params: { roomId: data.room_id } });
    return;
  }
  if (data.kind === 'notification' && typeof data.related_id === 'string') {
    if (data.related_type === 'assignment') router.push({ pathname: '/assignment/[id]', params: { id: data.related_id } });
    else if (data.related_type === 'submission') router.push({ pathname: '/result/[id]', params: { id: data.related_id } });
  }
}

/** Gắn 1 lần khi đã đăng nhập: đăng ký token, xử lý bấm thông báo, đồng bộ số trên icon app. */
export const PushBridge = Notifications ? createPushBridge(Notifications) : () => null;

function createPushBridge(Notifications: typeof NotificationsModule) {
  return function PushBridge() {
    const lastResponse = Notifications.useLastNotificationResponse();
    const handled = useRef<string | null>(null);
    const unread = useUnreadTotal();
    const unreadRooms = useUnreadRoomKey();
    const notifUnread = useUnreadNotificationCount().data ?? 0;
    const refreshNotifications = useInvalidateNotifications();
    const prevRooms = useRef<string | null>(null);
    const prevNotif = useRef(0);

    useEffect(() => {
      void registerForPush();
      return watchPushToken();
    }, []);

    // Đọc xong 1 phòng ngay trong app → gỡ thông báo của phòng đó khỏi khay (đọc ở nơi khác thì
    // server gửi push ngầm, background.ts gỡ). Chỉ gỡ phòng vừa CHUYỂN từ chưa đọc → đã đọc, không
    // quét tất cả: thông báo mới có thể tới trước khi danh sách phòng kịp cập nhật.
    useEffect(() => {
      const prev = prevRooms.current;
      prevRooms.current = unreadRooms;
      if (prev === null) return;
      const now = new Set(unreadRooms.split(',').filter(Boolean));
      const read = prev.split(',').filter((id) => id && !now.has(id));
      if (read.length) void dismissByTags(read.map((id) => `chat:${id}`)).catch(() => undefined);
    }, [unreadRooms]);

    useEffect(() => {
      if (prevNotif.current > 0 && notifUnread === 0) void dismissByTags(['noti:*']).catch(() => undefined);
      prevNotif.current = notifUnread;
    }, [notifUnread]);

    // Bấm thông báo — kể cả khi app đang tắt hẳn (cold start) — chỉ xử lý mỗi thông báo 1 lần.
    useEffect(() => {
      if (!lastResponse || lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const id = lastResponse.notification.request.identifier;
      if (handled.current === id) return;
      handled.current = id;
      openFromPush(readPayload(lastResponse.notification.request.content.data));
    }, [lastResponse]);

    // Thông báo hệ thống (không phải chat) tới khi đang mở app → làm mới chuông ngay, khỏi chờ 30 giây
    useEffect(() => {
      const sub = Notifications.addNotificationReceivedListener((n) => {
        const data = readPayload(n.request.content.data);
        if (data.type !== 'sync' && data.kind !== 'chat') void refreshNotifications();
      });
      return () => sub.remove();
    }, [refreshNotifications]);

    // Số trên icon app = tổng tin chat chưa đọc (bỏ phòng đã tắt thông báo) — giống badge server gửi.
    // Tối đa 99: iOS chỉ hiện được số, không có "99+".
    useEffect(() => {
      void Notifications.setBadgeCountAsync(Math.min(99, unread)).catch(() => undefined);
    }, [unread]);

    return null;
  };
}
