import '../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Toaster } from '@/components/ui/toast';
import { ChatSocketBridge } from '@/features/chat/socket';
import { PushBridge } from '@/features/push/push';
import { queryClient } from '@/lib/query-client';
import { useAuthStore } from '@/stores/auth.store';
import { loadThemePreference, useThemePreference } from '@/theme/theme-preference';

SplashScreen.preventAutoHideAsync();

/**
 * Mở thẳng 1 màn từ link / thông báo đẩy (vd `uspeakclass://open-courses`) thì vẫn đặt (tabs) bên dưới —
 * không có thì màn đó là gốc của ngăn xếp, mất nút quay lại. Lúc chưa đăng nhập (tabs) bị Protected ẩn,
 * React Navigation tự rơi về màn đầu tiên còn lại (login).
 */
export const unstable_settings = { initialRouteName: '(tabs)' };

export default function RootLayout() {
  const scheme = useColorScheme();
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  // Giao diện: lựa chọn ở màn Tài khoản (sáng/tối) đè lên cài đặt của máy
  const pref = useThemePreference();
  const dark = (pref === 'system' ? scheme : pref) === 'dark';

  useEffect(() => {
    void bootstrap();
    void loadThemePreference();
  }, [bootstrap]);

  // Giữ splash tới khi biết đã đăng nhập hay chưa — tránh nháy màn Login rồi mới vào app.
  useEffect(() => {
    if (status !== 'booting') void SplashScreen.hideAsync();
  }, [status]);

  if (status === 'booting') return null;

  const signedIn = status === 'signedIn';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={dark ? DarkTheme : DefaultTheme}>
          <StatusBar style={dark ? 'light' : 'dark'} />
          {signedIn ? (
            <>
              <ChatSocketBridge />
              <PushBridge />
            </>
          ) : null}
          <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Protected guard={signedIn}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              {/* class/[id] và teach/[id] giờ là THƯ MỤC (index + các màn con) — mỗi màn tự khai
                  options của nó, khai ở đây sẽ trỏ vào route không tồn tại. */}
              <Stack.Screen name="schedule" options={{ title: 'Lịch trình' }} />
              <Stack.Screen name="chat/[roomId]" options={{ title: '' }} />
              <Stack.Screen name="chat/info/[roomId]" options={{ title: 'Thông tin' }} />
              <Stack.Screen name="chat/new" options={{ title: 'Nhắn tin mới' }} />
              <Stack.Screen name="chat/new-group" options={{ title: 'Tạo nhóm chat' }} />
              <Stack.Screen name="chat/media/[roomId]" options={{ title: 'Ảnh, tệp, link' }} />
              <Stack.Screen name="assignment/[id]" options={{ title: 'Bài tập' }} />
              <Stack.Screen name="result/[id]" options={{ title: 'Kết quả' }} />
              <Stack.Screen name="submit-success" options={{ title: '' }} />
              <Stack.Screen name="features" options={{ title: 'Tất cả tính năng' }} />
              <Stack.Screen name="feature/[key]" options={{ title: '' }} />
            </Stack.Protected>

            <Stack.Protected guard={!signedIn}>
              <Stack.Screen name="login" options={{ headerShown: false }} />
            </Stack.Protected>
          </Stack>
          {/* Khay thông báo nổi trên mọi màn — gắn MỘT LẦN ở đây */}
          <Toaster />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
