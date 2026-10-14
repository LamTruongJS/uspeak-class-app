import { AxiosError, create, isAxiosError, type InternalAxiosRequestConfig } from 'axios';

import { API_URL } from '@/config/env';
import { tokenStorage, type SessionTokens } from '@/lib/auth/token-storage';

/** Dạng response chung của class-be: `{ data, message }` */
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

const BASE_HEADERS = {
  'Content-Type': 'application/json',
  // class-be đọc header này để trả token trong body thay vì set cookie.
  'X-Client-Type': 'mobile',
  // Web có chế độ "test" cho admin; app luôn chạy dữ liệu thật.
  'x-class-mode': 'production',
};

export const api = create({
  baseURL: API_URL,
  timeout: 60_000,
  headers: BASE_HEADERS,
});

// Client riêng cho refresh — không đi qua interceptor của `api` để khỏi vòng lặp 401.
const refreshClient = create({ baseURL: API_URL, timeout: 30_000, headers: BASE_HEADERS });

// ─── Phiên hết hạn ──────────────────────────────────────────────────────────
// Auth store đăng ký callback này (tránh import vòng api ⇄ store).
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler;
}

// ─── Refresh token (single-flight) ──────────────────────────────────────────
// Nhiều request cùng 401 một lúc chỉ refresh MỘT lần; refresh token bên CRM xoay vòng nên
// gọi song song 2 lần thì lần sau dùng token đã bị thu hồi → bị đá ra ngoài oan.
let refreshing: Promise<SessionTokens | null> | null = null;

export function refreshSession(): Promise<SessionTokens | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const current = await tokenStorage.get();
      if (!current?.refreshToken) return null;
      try {
        const res = await refreshClient.post<{ tokens?: SessionTokens }>('/auth/refresh-token', {
          refreshToken: current.refreshToken,
        });
        const tokens = res.data?.tokens;
        if (!tokens?.accessToken) return null;
        await tokenStorage.set(tokens);
        return tokens;
      } catch (err) {
        // Mất mạng thì KHÔNG coi là hết phiên — giữ token để thử lại sau.
        if (isAxiosError(err) && !err.response) throw err;
        return null;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

// ─── Interceptors ───────────────────────────────────────────────────────────
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const tokens = await tokenStorage.get();
  if (tokens?.accessToken) {
    config.headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }
  return config;
});

const AUTH_PATHS = ['/auth/login', '/auth/refresh-token', '/auth/google', '/auth/logout'];

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const url = config?.url || '';

    if (
      error.response?.status === 401 &&
      config &&
      !config._retried &&
      !AUTH_PATHS.some((p) => url.includes(p))
    ) {
      config._retried = true;
      const tokens = await refreshSession();
      if (tokens) {
        config.headers.set('Authorization', `Bearer ${tokens.accessToken}`);
        return api(config);
      }
      await tokenStorage.clear();
      onSessionExpired?.();
    }

    return Promise.reject(error);
  },
);

/** Lấy câu báo lỗi dễ đọc từ lỗi axios (class-be trả `message` là chuỗi hoặc mảng). */
export function getErrorMessage(error: unknown, fallback = 'Đã có lỗi xảy ra, vui lòng thử lại.') {
  if (isAxiosError(error)) {
    if (!error.response) return 'Không kết nối được máy chủ. Kiểm tra mạng và thử lại.';
    const msg = (error.response.data as { message?: unknown })?.message;
    if (typeof msg === 'string' && msg) return msg;
    if (Array.isArray(msg) && msg.length) return String(msg[0]);
    if (msg && typeof msg === 'object' && 'message' in msg) return String((msg as any).message);
  }
  return fallback;
}
