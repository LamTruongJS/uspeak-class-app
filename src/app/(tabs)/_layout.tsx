import { Tabs } from 'expo-router/js-tabs';

import { FloatingTabBar } from '@/components/ui/floating-tab-bar';
import { isStaffRole } from '@/navigation/features';
import { useAuthStore } from '@/stores/auth.store';

/**
 * 5 tab chính. Tab cố định cho mọi vai trò — chỉ đổi nhãn/nội dung theo vai trò, vì đổi số tab
 * lúc đang chạy sẽ remount navigator và mất trạng thái. Mọi tính năng khác vào qua
 * "Tất cả tính năng" ở tab Tài khoản / Trang chủ.
 *
 * Dùng tab JS (`expo-router/js-tabs`) + thanh menu tự vẽ (`FloatingTabBar`) thay cho NativeTabs:
 * thanh native không cho bỏ chữ, không bo tròn nổi lên và không thay icon bằng ảnh đại diện được.
 */
export default function TabsLayout() {
  const role = useAuthStore((s) => s.user?.role_code);
  const staff = isStaffRole(role);

  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Trang chủ' }} />
      <Tabs.Screen name="classes" options={{ title: staff ? 'Lớp dạy' : 'Lớp học' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      <Tabs.Screen name="assignments" options={{ title: staff ? 'Chấm bài' : 'Bài tập' }} />
      <Tabs.Screen name="account" options={{ title: 'Tài khoản' }} />
    </Tabs>
  );
}
