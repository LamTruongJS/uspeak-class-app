import AsyncStorage from '@react-native-async-storage/async-storage';
import type * as NotificationsModule from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { api } from '@/lib/api/client';

import { ACTION_READ, ACTION_REPLY, Notifications, PUSH_TASK } from './push-token';

/**
 * Xử lý thông báo KHÔNG cần mở app — file này nạp ở `index.ts` (trước expo-router) vì
 * `TaskManager.defineTask` phải chạy ở phạm vi toàn cục, kể cả khi hệ điều hành đánh thức app ngầm.
 *
 * 1. Push ngầm `{ type: 'sync', badge, dismiss }` do class-be gửi khi người dùng ĐỌC ở web /
 *    máy khác (PushService.syncNative): gỡ thông báo đã đọc khỏi khay + đặt lại số trên icon.
 * 2. Nút trên thông báo tin nhắn: "Trả lời" (gõ ngay trên thông báo) và "Đánh dấu đã đọc".
 *    - Android, app đang tắt/ở nền → hệ điều hành chạy tác vụ nền bên dưới.
 *    - App đang mở, hoặc iOS → listener ở cuối file. iOS không chạy tác vụ nền cho nút bấm; nếu
 *      app chưa kịp nạp JS thì phản hồi được xử lý ở lần mở app kế tiếp (getLastNotificationResponse).
 *    Android còn giữ lại phản hồi đã chạy ngầm và giao lại cho listener khi mở app → chống chạy
 *    2 lần bằng dấu "đã xử lý" lưu trong AsyncStorage.
 */

type Payload = Record<string, unknown>;

const HANDLED_KEY = 'uspeak.class.pushHandled';
const HANDLED_MAX = 30;

/** Gộp phần dữ liệu tuỳ biến: Android để thẳng trong data, iOS (qua Expo) nằm trong chuỗi JSON. */
export function readPayload(raw: unknown): Payload {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Payload;
  let extra: Payload = {};
  for (const k of ['dataString', 'body']) {
    const v = d[k];
    if (typeof v !== 'string') continue;
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === 'object') extra = { ...extra, ...parsed };
    } catch {
      // body của tin thường là JSON; chuỗi khác thì bỏ qua
    }
  }
  return { ...d, ...extra };
}

function asTags(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((t): t is string => typeof t === 'string');
  if (typeof v === 'string') {
    try {
      return asTags(JSON.parse(v));
    } catch {
      return [v];
    }
  }
  return [];
}

/** Tag của thông báo đang hiện: Android dùng tag làm identifier, iOS lưu trong data.tag. */
function tagOf(n: NotificationsModule.Notification): string {
  const data = n.request.content.data as Payload | null;
  return typeof data?.tag === 'string' ? data.tag : n.request.identifier;
}

const matches = (tag: string, wanted: string) => (wanted.endsWith('*') ? tag.startsWith(wanted.slice(0, -1)) : tag === wanted);

/** Gỡ khỏi khay các thông báo có tag thuộc danh sách (hậu tố `*` = theo tiền tố, vd `noti:*`). */
export async function dismissByTags(tags: string[]) {
  if (!Notifications || !tags.length) return;
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    presented
      .filter((n) => tags.some((t) => matches(tagOf(n), t)))
      .map((n) => Notifications!.dismissNotificationAsync(n.request.identifier)),
  );
}

async function handleSync(data: Payload) {
  if (!Notifications) return;
  await dismissByTags(asTags(data.dismiss));
  const badge = Number(data.badge);
  if (Number.isFinite(badge) && badge >= 0) await Notifications.setBadgeCountAsync(Math.min(99, badge));
}

/** Đánh dấu phản hồi đã xử lý; trả về false nếu đã có người xử lý trước (chống chạy 2 lần). */
async function claim(key: string): Promise<boolean> {
  try {
    const list: string[] = JSON.parse((await AsyncStorage.getItem(HANDLED_KEY)) || '[]');
    if (list.includes(key)) return false;
    await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify([...list, key].slice(-HANDLED_MAX)));
  } catch {
    // AsyncStorage hỏng thì vẫn làm — trùng 1 lần còn hơn mất tin trả lời
  }
  return true;
}

/** Nút Trả lời / Đánh dấu đã đọc. Trả về true nếu đây là phản hồi của nút (không phải chạm thường). */
export async function handleAction(resp: NotificationsModule.NotificationResponse): Promise<boolean> {
  const action = resp.actionIdentifier;
  if (action !== ACTION_REPLY && action !== ACTION_READ) return false;
  const req = resp.notification.request;
  if (!(await claim(`${req.identifier}|${action}|${resp.notification.date}`))) return true;

  const data = readPayload(req.content.data);
  const roomId = data.kind === 'chat' && typeof data.room_id === 'string' ? data.room_id : undefined;
  if (!roomId) return true;

  try {
    const text = (resp.userText || '').trim();
    // Trả lời cũng coi như đã đọc cả phòng (giống Zalo) — quick-reply đã tự đánh dấu. Server còn gửi
    // push ngầm gỡ thông báo phòng này ở máy khác.
    if (action === ACTION_REPLY && text) await api.post(`/chat/rooms/${roomId}/quick-reply`, { content: text });
    else await api.post(`/chat/rooms/${roomId}/read-latest`);
    await Notifications?.dismissNotificationAsync(req.identifier);
  } catch {
    // Mất mạng / hết phiên: báo lại trên chính thông báo đó để người dùng biết tin CHƯA đi.
    await Notifications?.scheduleNotificationAsync({
      identifier: req.identifier,
      content: {
        title: req.content.title || 'Uspeak',
        body: action === ACTION_REPLY ? 'Chưa gửi được tin trả lời — mở app để thử lại.' : 'Chưa đánh dấu đã đọc được.',
        data: req.content.data,
      },
      trigger: null,
    });
  }
  return true;
}

if (Notifications) {
  TaskManager.defineTask<NotificationsModule.NotificationTaskPayload>(PUSH_TASK, async ({ data }) => {
    try {
      if (data && 'actionIdentifier' in data) {
        await handleAction(data as NotificationsModule.NotificationResponse);
      } else if (data) {
        const payload = readPayload((data as { data?: unknown }).data);
        if (payload.type === 'sync') await handleSync(payload);
      }
      return Notifications!.BackgroundNotificationTaskResult.NewData;
    } catch {
      return Notifications!.BackgroundNotificationTaskResult.Failed;
    }
  });

  // App đang mở (cả 2 nền tảng) hoặc iOS bấm nút khi app ở nền.
  Notifications.addNotificationResponseReceivedListener((resp) => void handleAction(resp));
  // Bấm nút lúc app chưa chạy JS (iOS) → xử lý ở lần mở app này.
  void Notifications.getLastNotificationResponseAsync()
    .then((resp) => (resp ? handleAction(resp) : false))
    .catch(() => undefined);
  // Push ngầm tới lúc app đang mở: chạy luôn, khỏi chờ tác vụ nền.
  Notifications.addNotificationReceivedListener((n) => {
    const payload = readPayload(n.request.content.data);
    if (payload.type === 'sync') void handleSync(payload);
  });
}
