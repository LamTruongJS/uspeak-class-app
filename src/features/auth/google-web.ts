import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { WEB_URL } from '@/config/env';

/**
 * Đăng nhập Google "mượn web": mở trang {WEB_URL}/mobile-login (uspeak-class-fe) trong trình duyệt
 * hệ thống (iOS ASWebAuthenticationSession, Android Chrome Custom Tab). Trang đó dùng chính OAuth
 * client Web của class-fe lấy access token Google rồi chuyển về `uspeakclass://auth#accessToken=…`,
 * trình duyệt tự đóng và app gửi token lên POST /auth/google — y như nút Google của web.
 * Không cần client OAuth iOS/Android, không SHA-1, chạy cả Expo Go (exp://…/--/auth).
 *
 * Trả về `null` khi người dùng tự đóng trình duyệt / bấm huỷ ở Google.
 */
export async function getGoogleAccessTokenViaWeb(): Promise<string | null> {
  const returnUrl = Linking.createURL('auth');
  const res = await WebBrowser.openAuthSessionAsync(`${WEB_URL}/mobile-login?redirect=${encodeURIComponent(returnUrl)}`, returnUrl, {
    // Android: không giữ tab đăng nhập trong "Recent" sau khi quay về app
    showInRecents: false,
  });
  if (res.type !== 'success') return null;

  const params = new Map(
    (res.url.split('#')[1] ?? '').split('&').filter(Boolean).map((kv) => {
      const [k, v = ''] = kv.split('=');
      return [decodeURIComponent(k), decodeURIComponent(v.replace(/\+/g, ' '))] as const;
    }),
  );
  const token = params.get('accessToken');
  if (token) return token;
  const error = params.get('error');
  if (!error || error === 'cancelled') return null;
  throw new Error(error);
}

/** Link quay về từ trang đăng nhập (uspeakclass://auth#…, exp://…/--/auth#…) — Expo Router đừng mở nó thành màn. */
export function isGoogleAuthReturn(path: string) {
  return /(?:^|[/:])auth(?:[#?]|$)/.test(path);
}
