import * as SecureStore from 'expo-secure-store';

/**
 * Token phiên đăng nhập — cất trong Keychain (iOS) / Keystore (Android) qua SecureStore,
 * KHÔNG để AsyncStorage (dạng chữ trơn, app khác/backup đọc được).
 *
 * class-be chỉ trả token trong body khi request có header `X-Client-Type: mobile`
 * (xem uspeak-class-be/src/common/auth-cookie.util.ts → isMobileClient).
 */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** ISO — hạn access token */
  expiredAt: string;
}

const KEY = 'uspeak.session';

// Giữ bản trong RAM để interceptor không phải đọc Keychain ở mỗi request.
let cached: SessionTokens | null | undefined;

export const tokenStorage = {
  async get(): Promise<SessionTokens | null> {
    if (cached !== undefined) return cached;
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      cached = raw ? (JSON.parse(raw) as SessionTokens) : null;
    } catch {
      cached = null;
    }
    return cached;
  },

  async set(tokens: SessionTokens): Promise<void> {
    cached = tokens;
    await SecureStore.setItemAsync(KEY, JSON.stringify(tokens));
  },

  async clear(): Promise<void> {
    cached = null;
    await SecureStore.deleteItemAsync(KEY);
  },
};
