import { isGoogleAuthReturn } from '@/features/auth/google-web';

/**
 * Deep link đi vào app trước khi Expo Router điều hướng. Trên Android, link quay về sau khi đăng nhập
 * Google (uspeakclass://auth#accessToken=…) vừa tới WebBrowser.openAuthSessionAsync vừa tới router —
 * không chặn thì router mở màn "/auth" không tồn tại. iOS thì phiên xác thực tự hứng, không qua đây.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    if (isGoogleAuthReturn(path)) return initial ? '/' : null;
  } catch {
    // không để lỗi ở đây làm sập app
  }
  return path;
}
