import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import type * as NotificationsModule from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { activeRoom } from '@/features/chat/active-room';
import { useUnreadTotal } from '@/features/chat/api';
import { api } from '@/lib/api/client';

/**
 * Thông báo đẩy (push) qua Expo Push Service — class-be gửi ở `ExpoPushService`
 * (uspeak-class-be/src/push/expo-push.service.ts) tại đúng các điểm Web Push đang gửi
 * (tin chat, thông báo phòng) + thông báo trong app (bài mới, đã chấm, yêu cầu làm lại).
 *
 * data trong push:
 *  - { kind: 'chat', room_id }                        → mở phòng chat
 *  - { kind: 'notification', related_type, related_id } → 'assignment' mở bài, 'submission' mở kết quả
 */

const TOKEN_KEY = 'uspeak.pushToken';

/**
 * Expo Go trên Android (từ SDK 53) ném lỗi NGAY KHI IMPORT expo-notifications → làm sập cả app.
 * Nên chỉ nạp module khi chạy được: bản build thật / development build, hoặc Expo Go trên iPhone.
 */
const PUSH_SUPPORTED = !(Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient);
const Notifications: typeof NotificationsModule | null = PUSH_SUPPORTED
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-notifications') as typeof NotificationsModule)
  : null;

// App đang mở mà nhận push: đang xem đúng phòng đó thì im lặng (tin đã hiện trong luồng chat),
// còn lại vẫn hiện banner như Zalo/Messenger.
Notifications?.setNotificationHandler({
  handleNotification: async (n) => {
    const roomId = n.request.content.data?.room_id;
    const viewingRoom = !!roomId && roomId === activeRoom.id && AppState.currentState === 'active';
    return {
      shouldShowBanner: !viewingRoom,
      shouldShowList: !viewingRoom,
      shouldPlaySound: !viewingRoom,
      shouldSetBadge: true,
    };
  },
});

/** Android 8+ bắt buộc có kênh; server gửi channelId 'chat' | 'general'. */
async function ensureAndroidChannels() {
  if (Platform.OS !== 'android' || !Notifications) return;
  await Notifications.setNotificationChannelAsync('chat', {
    name: 'Tin nhắn',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: '#b62025',
  });
  await Notifications.setNotificationChannelAsync('general', {
    name: 'Bài tập & thông báo',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

function projectId(): string | undefined {
  return (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ?? Constants.easConfig?.projectId;
}

/**
 * Xin quyền + lấy Expo push token + gửi lên class-be. Gọi lại mỗi lần mở app là bình thường
 * (server upsert theo token) — token có thể đổi sau khi cài lại app / khôi phục máy.
 */
export async function registerForPush(): Promise<string | null> {
  try {
    if (!Notifications) return null; // Expo Go Android — cần development build
    if (!Device.isDevice) return null; // máy ảo iOS không nhận push

    await ensureAndroidChannels();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    const pid = projectId();
    if (!pid) {
      console.warn('[push] Chưa có extra.eas.projectId — chạy `npx eas-cli init` để bật thông báo đẩy.');
      return null;
    }
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: pid });
    await api.post('/push/mobile-token', {
      token,
      platform: Platform.OS,
      device_name: Device.deviceName ?? Device.modelName ?? null,
      app_version: Constants.expoConfig?.version ?? null,
    });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch (err) {
    console.warn('[push] Đăng ký thông báo thất bại:', err);
    return null;
  }
}

/** Gọi TRƯỚC khi xoá phiên đăng nhập (cần access token để server biết token của ai). */
export async function unregisterPush() {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) await api.delete('/push/mobile-token', { data: { token } });
    await AsyncStorage.removeItem(TOKEN_KEY);
    await Notifications?.setBadgeCountAsync(0);
  } catch {
    // Mất mạng lúc đăng xuất: token sẽ bị gỡ khi máy đăng nhập tài khoản khác (server upsert theo token).
  }
}

/** Mở đúng màn theo data của thông báo. */
function openFromPush(data: Record<string, unknown> | undefined) {
  if (!data) return;
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

    useEffect(() => {
      void registerForPush();
    }, []);

    // Bấm thông báo — kể cả khi app đang tắt hẳn (cold start) — chỉ xử lý mỗi thông báo 1 lần.
    useEffect(() => {
      if (!lastResponse || lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const id = lastResponse.notification.request.identifier;
      if (handled.current === id) return;
      handled.current = id;
      openFromPush(lastResponse.notification.request.content.data as Record<string, unknown>);
    }, [lastResponse]);

    // Số trên icon app = tổng tin chat chưa đọc (bỏ phòng đã tắt thông báo) — giống badge server gửi.
    useEffect(() => {
      void Notifications.setBadgeCountAsync(unread).catch(() => undefined);
    }, [unread]);

    return null;
  };
}
