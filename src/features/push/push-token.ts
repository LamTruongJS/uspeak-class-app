import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsModule from 'expo-notifications';
import { Platform } from 'react-native';

import { api } from '@/lib/api/client';

/**
 * Phần đăng ký / gỡ token push — tách khỏi push.ts để auth.store gọi được `unregisterPush` mà không
 * kéo theo chat/api, và để tác vụ nền (background.ts) chỉ cần nạp file này.
 *
 * Token gửi lên class-be (POST /push/mobile-token):
 *  - iOS: Expo push token (provider 'expo') → BE gửi qua Expo Push Service.
 *  - Android: token FCM thô (provider 'fcm') → BE gửi THẲNG FCM để gom 1 dòng/phòng (tag), có ảnh
 *    người gửi và nút bấm — Expo Push không chuyển được mấy thứ đó (xem expo-push.service.ts của BE).
 */

const TOKEN_KEY = 'uspeak.pushToken';

/** Tên tác vụ nền nhận push ngầm + bấm nút trên thông báo khi app tắt (background.ts). */
export const PUSH_TASK = 'uspeak-class-push';

/** Nút trên thông báo tin nhắn — server gửi `categoryId: 'chat'`. */
export const CHAT_CATEGORY = 'chat';
export const ACTION_REPLY = 'reply';
export const ACTION_READ = 'mark_read';

/**
 * Expo Go trên Android (từ SDK 53) ném lỗi NGAY KHI IMPORT expo-notifications → làm sập cả app.
 * Nên chỉ nạp module khi chạy được: bản build thật / development build, hoặc Expo Go trên iPhone.
 */
const PUSH_SUPPORTED = !(Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient);
export const Notifications: typeof NotificationsModule | null = PUSH_SUPPORTED
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-notifications') as typeof NotificationsModule)
  : null;

/** Android 8+ bắt buộc có kênh; server gửi channelId 'chat' | 'general'. */
async function ensureAndroidChannels() {
  if (Platform.OS !== 'android' || !Notifications) return;
  await Notifications.setNotificationChannelAsync('chat', {
    name: 'Tin nhắn',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: '#b62025',
    showBadge: true,
  });
  await Notifications.setNotificationChannelAsync('general', {
    name: 'Bài tập & thông báo',
    importance: Notifications.AndroidImportance.DEFAULT,
    showBadge: true,
  });
}

/** Nút Trả lời (ô nhập ngay trên thông báo) + Đánh dấu đã đọc — cả 2 không mở app, giống Zalo. */
async function ensureCategories() {
  if (!Notifications) return;
  await Notifications.setNotificationCategoryAsync(CHAT_CATEGORY, [
    {
      identifier: ACTION_REPLY,
      buttonTitle: 'Trả lời',
      textInput: { submitButtonTitle: 'Gửi', placeholder: 'Nhập tin nhắn…' },
      options: { opensAppToForeground: false },
    },
    {
      identifier: ACTION_READ,
      buttonTitle: 'Đánh dấu đã đọc',
      options: { opensAppToForeground: false },
    },
  ]);
}

function projectId(): string | undefined {
  return (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ?? Constants.easConfig?.projectId;
}

async function sendToken(token: string) {
  await api.post('/push/mobile-token', {
    token,
    platform: Platform.OS,
    provider: Platform.OS === 'android' ? 'fcm' : 'expo',
    device_name: Device.deviceName ?? Device.modelName ?? null,
    app_version: Constants.expoConfig?.version ?? null,
  });
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

/**
 * Xin quyền + lấy token + gửi lên class-be. Gọi lại mỗi lần mở app là bình thường (server upsert
 * theo token) — token có thể đổi sau khi cài lại app / khôi phục máy.
 */
export async function registerForPush(): Promise<string | null> {
  try {
    if (!Notifications) return null; // Expo Go Android — cần bản build thật
    // Máy ảo iOS không nhận push. Máy ảo Android có Google Play thì nhận FCM bình thường — đừng chặn.
    if (Platform.OS === 'ios' && !Device.isDevice) return null;

    await ensureAndroidChannels();
    await ensureCategories();
    await Notifications.registerTaskAsync(PUSH_TASK).catch(() => undefined);

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    let token: string;
    if (Platform.OS === 'android') {
      token = String((await Notifications.getDevicePushTokenAsync()).data);
    } else {
      const pid = projectId();
      if (!pid) {
        console.warn('[push] Chưa có extra.eas.projectId — chạy `npx eas-cli init` để bật thông báo đẩy.');
        return null;
      }
      token = (await Notifications.getExpoPushTokenAsync({ projectId: pid })).data;
    }
    await sendToken(token);
    return token;
  } catch (err) {
    console.warn('[push] Đăng ký thông báo thất bại:', err);
    return null;
  }
}

/** FCM có thể cấp token mới bất cứ lúc nào (khôi phục máy, Google xoay token) → gửi lại ngay. */
export function watchPushToken() {
  if (!Notifications || Platform.OS !== 'android') return () => undefined;
  const sub = Notifications.addPushTokenListener((t) => {
    void sendToken(String(t.data)).catch(() => undefined);
  });
  return () => sub.remove();
}

/** Gọi TRƯỚC khi xoá phiên đăng nhập (cần access token để server biết token của ai). */
export async function unregisterPush() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) await api.delete('/push/mobile-token', { data: { token } });
    await AsyncStorage.removeItem(TOKEN_KEY);
    await Notifications?.dismissAllNotificationsAsync();
    await Notifications?.setBadgeCountAsync(0);
  } catch {
    // Mất mạng lúc đăng xuất: token sẽ bị gỡ khi máy đăng nhập tài khoản khác (server upsert theo token).
  }
}
