import { router, usePathname } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useEffect, useRef } from 'react';

import { FloatingTabBar } from '@/components/ui/floating-tab-bar';
import { MenuEdgeSwipe } from '@/features/navigation/app-menu';
import { homeTabForRole, isStaffRole } from '@/navigation/features';
import { useAuthStore } from '@/stores/auth.store';

/**
 * 5 tab chính. Tab cố định cho mọi vai trò — chỉ đổi nhãn/nội dung theo vai trò, vì đổi số tab
 * lúc đang chạy sẽ remount navigator và mất trạng thái. Thanh dưới thì KHÔNG cố định: mỗi vai trò
 * 4 ô riêng (`tabBarSlots`, có ô là màn Stack), tab không có trên thanh vẫn vào được từ menu. Mọi tính năng khác vào qua
 * "Tất cả tính năng" ở tab Tài khoản / Trang chủ.
 *
 * Dùng tab JS (`expo-router/js-tabs`) + thanh menu tự vẽ (`FloatingTabBar`) thay cho NativeTabs:
 * thanh native không cho bỏ chữ, không bo tròn nổi lên và không thay icon bằng ảnh đại diện được.
 */
export default function TabsLayout() {
  const role = useAuthStore((s) => s.user?.role_code);
  const staff = isStaffRole(role);
  const pathname = usePathname();

  /**
   * Mở app thì vào đúng trang đầu của vai trò (giáo viên → Lớp dạy, chấm bài/trợ giảng → Nhận xét bài),
   * giống web sau đăng nhập. URL `/` luôn trỏ vào Trang chủ nên phải chuyển tay MỘT lần lúc mới vào —
   * `initialRouteName` của navigator bị URL đè. Mở từ link/thông báo (đường dẫn khác `/`) thì để yên.
   */
  const landed = useRef(false);
  useEffect(() => {
    if (landed.current || !role) return;
    landed.current = true;
    const home = homeTabForRole(role);
    if (pathname === '/' && home !== 'index') router.replace(`/${home}`);
  }, [role, pathname]);

  return (
    <MenuEdgeSwipe>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <FloatingTabBar {...props} />}>
        <Tabs.Screen name="index" options={{ title: 'Trang chủ' }} />
        <Tabs.Screen name="classes" options={{ title: staff ? 'Lớp dạy' : 'Lớp học' }} />
        <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
        <Tabs.Screen name="assignments" options={{ title: staff ? 'Nhận xét bài' : 'Bài tập' }} />
        <Tabs.Screen name="account" options={{ title: 'Tài khoản' }} />
      </Tabs>
    </MenuEdgeSwipe>
  );
}
