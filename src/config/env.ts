import Constants from 'expo-constants';

/**
 * Địa chỉ class-be.
 *
 * - Production: https://class.uspeak.vn/api (đặt EXPO_PUBLIC_API_URL trong .env / EAS env).
 * - Dev: điện thoại thật KHÔNG gọi được `localhost` của máy tính. Nếu URL trỏ localhost thì tự
 *   thay bằng IP LAN của máy đang chạy Metro (lấy từ hostUri của Expo) — nhờ vậy iPhone quét QR
 *   hay máy ảo Android đều gọi được class-be chạy trên máy anh, không phải sửa IP tay mỗi lần đổi mạng.
 */
function resolveApiUrl(): string {
  const raw = process.env.EXPO_PUBLIC_API_URL || 'https://class.uspeak.vn/api';
  if (!__DEV__ || !/localhost|127\.0\.0\.1/.test(raw)) return raw;

  const hostUri = Constants.expoConfig?.hostUri; // vd "192.168.1.43:8081"
  const devHost = hostUri?.split(':')[0];
  if (!devHost) return raw;
  return raw.replace(/localhost|127\.0\.0\.1/, devHost);
}

export const API_URL = resolveApiUrl().replace(/\/$/, '');

/** Gốc của class-be (không có /api) — dùng cho socket.io và ghép link file. */
export const API_ORIGIN = API_URL.replace(/\/api$/, '');

/** Web class — dùng mở các trang chưa có trên app (chính sách, thanh toán…). */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || 'https://class.uspeak.vn').replace(
  /\/$/,
  '',
);
