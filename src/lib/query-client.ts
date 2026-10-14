import { QueryClient, focusManager } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AppState, Platform } from 'react-native';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: (failureCount, error) => {
        // 4xx là lỗi thật (không quyền, không tồn tại) — thử lại vô ích.
        const status = isAxiosError(error) ? error.response?.status : undefined;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});

// Trên mobile không có sự kiện "focus" của trình duyệt: coi app quay lại foreground là focus
// để react-query tự làm mới dữ liệu cũ (giống web khi quay lại tab).
AppState.addEventListener('change', (state) => {
  if (Platform.OS !== 'web') focusManager.setFocused(state === 'active');
});
