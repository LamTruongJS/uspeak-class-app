import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAxiosError } from 'axios';
import { create } from 'zustand';

import { authApi } from '@/features/auth/api';
import { unregisterPush } from '@/features/push/push-token';
import type { LoginSuccess, User } from '@/features/auth/types';
import { setSessionExpiredHandler } from '@/lib/api/client';
import { TokenUnavailableError, tokenStorage } from '@/lib/auth/token-storage';
import { retryWhenActive } from '@/lib/retry-when-active';
import { queryClient } from '@/lib/query-client';

type AuthStatus = 'booting' | 'signedIn' | 'signedOut';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  /** Mở app: có token thì lấy lại hồ sơ; mất mạng thì vẫn vào bằng hồ sơ đã lưu. */
  bootstrap: () => Promise<void>;
  /** Gọi sau khi /auth/login (hoặc google, switch-role) trả về thành công. */
  completeLogin: (result: LoginSuccess) => Promise<void>;
  /** Lấy lại hồ sơ đầy đủ từ /auth/profile (im lặng — hỏng thì giữ nguyên hồ sơ đang có). */
  refreshProfile: () => Promise<void>;
  setUser: (user: User) => void;
  logout: () => Promise<void>;
}

// Hồ sơ (không chứa token) để mở app khi offline. Token nằm riêng trong SecureStore.
const USER_CACHE_KEY = 'uspeak.user';

async function cacheUser(user: User | null) {
  if (user) await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  else await AsyncStorage.removeItem(USER_CACHE_KEY);
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'booting',
  user: null,

  bootstrap: async () => {
    let tokens: Awaited<ReturnType<typeof tokenStorage.get>>;
    try {
      tokens = await tokenStorage.get();
    } catch (err) {
      // Keychain chưa đọc được (push ngầm mở app lúc iPhone đang khoá) — KHÔNG phải chưa đăng nhập.
      // Giữ màn chờ, app trở lại foreground thì thử lại.
      if (err instanceof TokenUnavailableError) {
        retryWhenActive(() => void get().bootstrap());
        return;
      }
      throw err;
    }
    if (!tokens) {
      set({ status: 'signedOut', user: null });
      return;
    }
    try {
      const user = await authApi.getProfile();
      await cacheUser(user);
      set({ status: 'signedIn', user });
    } catch (err) {
      // 401 đã được interceptor xử lý (refresh hỏng thật → xoá phiên, đá về login). Lỗi khác — mất
      // mạng, server/CRM đang lỗi (5xx), quá hạn chờ… — KHÔNG phải hết phiên: vào app bằng hồ sơ cũ.
      const unauthorized = isAxiosError(err) && err.response?.status === 401;
      const cached = unauthorized ? null : await AsyncStorage.getItem(USER_CACHE_KEY);
      if (cached) set({ status: 'signedIn', user: JSON.parse(cached) as User });
      else if (get().status === 'booting') set({ status: 'signedOut', user: null });
    }
  },

  completeLogin: async (result) => {
    await tokenStorage.set(result.tokens);
    queryClient.clear(); // không để dữ liệu của tài khoản/vai trò trước lọt sang
    // CRM CHỈ gắn `available_roles` vào /auth/profile; đáp án của login và switch-role không có.
    // Ghi đè thẳng result.data là mất danh sách vai trò → đổi sang Học viên xong không còn chỗ
    // đổi ngược lại (lỗi 15/10/2026). Giữ tạm danh sách cũ rồi xin hồ sơ đầy đủ ngay sau đó.
    const prev = get().user;
    const user = result.data.available_roles?.length
      ? result.data
      : { ...result.data, available_roles: prev?.available_roles };
    await cacheUser(user);
    set({ status: 'signedIn', user });
    void get().refreshProfile();
  },

  refreshProfile: async () => {
    try {
      const user = await authApi.getProfile();
      await cacheUser(user);
      set({ user });
    } catch {
      // Mất mạng / lỗi tạm thời: giữ hồ sơ đang có, 401 đã có interceptor lo
    }
  },

  setUser: (user) => {
    void cacheUser(user);
    set({ user });
  },

  logout: async () => {
    // Gỡ push token TRƯỚC khi thu hồi phiên (cần access token) — máy này thôi nhận thông báo của tài khoản cũ.
    await unregisterPush();
    await authApi.logout();
    await tokenStorage.clear();
    await cacheUser(null);
    queryClient.clear();
    set({ status: 'signedOut', user: null });
  },
}));

setSessionExpiredHandler(() => {
  void cacheUser(null);
  queryClient.clear();
  useAuthStore.setState({ status: 'signedOut', user: null });
});
