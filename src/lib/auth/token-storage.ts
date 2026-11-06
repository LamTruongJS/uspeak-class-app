import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Token phiên đăng nhập — cất trong Keychain (iOS) / Keystore (Android) qua SecureStore,
 * KHÔNG để AsyncStorage (dạng chữ trơn, app khác/backup đọc được).
 *
 * class-be chỉ trả token trong body khi request có header `X-Client-Type: mobile`
 * (xem uspeak-class-be/src/common/auth-cookie.util.ts → isMobileClient).
 *
 * Lỗi "hay bị đăng xuất" (05/11/2026): push ngầm (đồng bộ badge, nút trên thông báo) đánh thức app
 * lúc iPhone ĐANG KHOÁ. Mặc định SecureStore lưu kiểu WHEN_UNLOCKED → khoá máy thì đọc Keychain lỗi
 * → bản cũ coi lỗi là "chưa có token" → app khởi động thẳng vào màn đăng nhập. Tệ hơn: refresh
 * token CRM xoay vòng, ghi token mới lúc máy khoá cũng lỗi → token cũ hết ân hạn 30s là bị đá thật.
 * Nay: lưu AFTER_FIRST_UNLOCK (đọc/ghi được cả khi khoá, chỉ cần đã mở khoá 1 lần từ lúc bật máy);
 * đọc lỗi thì NÉM `TokenUnavailableError` thay vì trả null — người gọi chờ rồi thử lại, không đăng xuất.
 */
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  /** ISO — hạn access token */
  expiredAt: string;
}

const KEY = 'uspeak.session';
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
// Token lưu từ bản cũ vẫn mang thuộc tính WHEN_UNLOCKED (update chỉ đổi dữ liệu, không đổi thuộc
// tính) → phải xoá rồi ghi lại 1 lần. Cờ này đánh dấu đã chuyển.
const MIGRATED_KEY = 'uspeak.session.afu';

/** Keychain chưa đọc được (máy đang khoá…) — KHÔNG có nghĩa là chưa đăng nhập. */
export class TokenUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('Chưa đọc được phiên đăng nhập');
    this.name = 'TokenUnavailableError';
    this.cause = cause;
  }
}

// Giữ bản trong RAM để interceptor không phải đọc Keychain ở mỗi request.
let cached: SessionTokens | null | undefined;

async function write(raw: string) {
  // Xoá trước: ghi đè lên mục cũ (WHEN_UNLOCKED) thì iOS chỉ thay dữ liệu, giữ thuộc tính cũ.
  await SecureStore.deleteItemAsync(KEY, OPTS).catch(() => undefined);
  await SecureStore.setItemAsync(KEY, raw, OPTS);
  await AsyncStorage.setItem(MIGRATED_KEY, '1').catch(() => undefined);
}

async function migrate(raw: string) {
  try {
    if (await AsyncStorage.getItem(MIGRATED_KEY)) return;
    await write(raw);
  } catch {
    // Lần mở app sau thử lại; token vẫn còn trong RAM nên phiên này không ảnh hưởng.
  }
}

export const tokenStorage = {
  /** null = chưa đăng nhập. Ném TokenUnavailableError khi Keychain tạm thời không đọc được. */
  async get(): Promise<SessionTokens | null> {
    if (cached !== undefined) return cached;
    let raw: string | null;
    try {
      raw = await SecureStore.getItemAsync(KEY, OPTS);
    } catch (err) {
      throw new TokenUnavailableError(err); // KHÔNG cache: lần sau (đã mở khoá) đọc lại
    }
    try {
      cached = raw ? (JSON.parse(raw) as SessionTokens) : null;
    } catch {
      cached = null; // dữ liệu hỏng thật → coi như chưa đăng nhập
    }
    if (raw && cached) void migrate(raw);
    return cached;
  },

  async set(tokens: SessionTokens): Promise<void> {
    cached = tokens;
    await write(JSON.stringify(tokens));
  },

  async clear(): Promise<void> {
    cached = null;
    await SecureStore.deleteItemAsync(KEY, OPTS).catch(() => undefined);
  },
};
