import { api, type ApiResponse } from '@/lib/api/client';
import { uploadMultipart } from '@/lib/api/upload';
import { tokenStorage } from '@/lib/auth/token-storage';

import type { GoogleSelectBody, LoginCredentials, LoginResult, PaymentInfo, User } from './types';

export type { PaymentInfo };

export const authApi = {
  async login(credentials: LoginCredentials): Promise<LoginResult> {
    const res = await api.post<LoginResult>('/auth/login', credentials);
    return res.data;
  },

  /** `accessToken` = access token Google (lấy qua trang web cầu nối — features/auth/google-web). */
  async googleLogin(accessToken: string): Promise<LoginResult> {
    const res = await api.post<LoginResult>('/auth/google', { accessToken });
    return res.data;
  },

  /** Bước chọn vai trò / tài khoản sau khi Google trả về nhiều lựa chọn — như web. */
  async googleSelect(body: GoogleSelectBody): Promise<LoginResult> {
    const res = await api.post<LoginResult>('/auth/google-select', body);
    return res.data;
  },

  async getProfile(): Promise<User> {
    const res = await api.get<ApiResponse<User>>('/auth/profile');
    return res.data.data;
  },

  /**
   * Sửa hồ sơ: tên, số điện thoại, thông tin nhận tiền. class-be chuyển tiếp sang CRM rồi trả về
   * user mới — nhớ đẩy vào store, không thì màn Tài khoản vẫn hiện số cũ tới khi đăng nhập lại.
   */
  async updateProfile(body: { name?: string; phone?: string; payment_info?: PaymentInfo }): Promise<Partial<User> | null> {
    const res = await api.patch<ApiResponse<User> | User>('/auth/profile', body);
    const data = res.data as ApiResponse<User> & User;
    return data?.data ?? data ?? null;
  },

  async switchRole(role_code: string): Promise<LoginResult> {
    const res = await api.post<LoginResult>('/auth/switch-role', { role_code });
    return res.data;
  },

  async changePassword(body: { currentPassword: string; newPassword: string }) {
    const res = await api.post<{ message: string }>('/auth/change-password', body);
    return res.data;
  },

  /** Đổi ảnh đại diện (class-be chuyển tiếp sang CRM, tối đa 5MB) → link ảnh mới. */
  async uploadAvatar(uri: string): Promise<string | null> {
    const res = await uploadMultipart<{ data?: { avatar?: string }; avatar?: string }>('/auth/upload-avatar', {
      avatar: { uri, name: 'avatar.jpg', type: 'image/jpeg' },
    });
    return res.data?.avatar ?? res.avatar ?? null;
  },

  /** Thu hồi refresh token phía CRM. Lỗi mạng cũng bỏ qua — máy vẫn xoá phiên. */
  async logout(): Promise<void> {
    const tokens = await tokenStorage.get();
    if (!tokens?.refreshToken) return;
    await api.post('/auth/logout', { refreshToken: tokens.refreshToken }).catch(() => undefined);
  },
};
