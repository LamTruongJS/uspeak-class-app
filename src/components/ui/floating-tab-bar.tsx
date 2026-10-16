import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { useMyPermissionCodes, useUnreadTotal } from '@/features/chat/api';
import { mediaCacheKey, useMediaUrl } from '@/lib/media';
import { featureForPath, isStaffRole, tabBarSlots, type AppFeature } from '@/navigation/features';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Chiều cao thanh + khoảng hở hai bên — dùng cho `useTabBarSpace` để nội dung không bị che. */
const BAR_HEIGHT = 58;
const BAR_GAP = 8;
/**
 * Nền tab đang chọn: viên thuốc NẰM NGANG (dài hơn cao) kiểu Material 3, không phải hình tròn.
 * `PILL_MAX_W` chỉ là trần: viên thuốc rộng bằng ô tab (`width: '100%'`) nên máy màn hình nhỏ
 * (5 tab × ~57dp) vẫn còn khe hở giữa các tab, không dính vào nhau.
 */
const PILL_H = 38;
const PILL_MAX_W = 62;
/** Ô vuông bọc icon — mốc neo cho huy hiệu số chưa đọc, giữ nguyên dù viên thuốc rộng ra. */
const ICON_BOX = 30;

/** Icon theo tên route của thư mục (tabs). Tab "account" vẽ ảnh đại diện thay cho icon. */
const ICONS: Record<string, { on: IconName; off: IconName; label: string }> = {
  index: { on: 'home', off: 'home-outline', label: 'Trang chủ' },
  classes: { on: 'school', off: 'school-outline', label: 'Lớp học' },
  chat: { on: 'chatbubbles', off: 'chatbubbles-outline', label: 'Chat' },
  assignments: { on: 'document-text', off: 'document-text-outline', label: 'Bài tập' },
  account: { on: 'person-circle', off: 'person-circle-outline', label: 'Tài khoản' },
};

/** Đường dẫn của 5 tab — dùng cho thanh tab vẽ ở màn Stack (không có `state` của navigator). */
const TAB_PATHS: Record<string, string> = {
  index: '/',
  classes: '/classes',
  chat: '/chat',
  assignments: '/assignments',
  account: '/account',
};

/**
 * Khoảng trống phải chừa ở ĐÁY mọi màn trong tab: thanh menu nổi đè lên nội dung, không chừa thì
 * dòng cuối danh sách nằm khuất dưới thanh.
 */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return BAR_HEIGHT + BAR_GAP * 2 + Math.max(insets.bottom, 6);
}

/**
 * Bản SỐ CỐ ĐỊNH của `useTabBarSpace` cho `contentStyle` của màn Stack — chỗ đó là object tĩnh,
 * không gọi được hook lấy safe-area. Lấy mức an toàn cho máy có thanh cử chỉ dưới đáy.
 */
export const TAB_BAR_SPACE = BAR_HEIGHT + BAR_GAP * 2 + 18;

interface TabItemSpec {
  key: string;
  icon: IconName;
  iconOff: IconName;
  label: string;
  focused: boolean;
  /** Vẽ ảnh đại diện thay icon (tab Tài khoản) */
  avatar?: boolean;
  badge?: number;
  onPress: () => void;
  onLongPress?: () => void;
}

/** Icon đặc (đang chọn) của 1 tính năng: tên Ionicons bỏ đuôi `-outline`. */
function solidIcon(icon: IconName): IconName {
  return icon.replace(/-outline$/, '') as IconName;
}

/** Ô của 1 tính năng (màn Stack) trên thanh tab. */
function featureItem(feature: AppFeature, focused: boolean, onPress: () => void): TabItemSpec {
  return { key: feature.key, icon: solidIcon(feature.icon), iconOff: feature.icon, label: feature.label, focused, onPress };
}

/** Các ô theo vai trò + quyền của người đang đăng nhập (`tabBarSlots`). */
function useTabBarSlots() {
  const role = useAuthStore((s) => s.user?.role_code);
  const permissions = useMyPermissionCodes();
  return { role, slots: tabBarSlots(role, permissions.data) };
}

/** Nhãn tab (cho trình đọc màn hình — thanh chỉ có icon) đổi theo vai trò như tiêu đề trong `(tabs)/_layout`. */
function tabLabel(name: string, staff: boolean) {
  if (name === 'classes') return staff ? 'Lớp dạy' : 'Lớp học';
  if (name === 'assignments') return staff ? 'Nhận xét bài' : 'Bài tập';
  return (ICONS[name] ?? ICONS.index).label;
}

/**
 * Thanh menu dưới kiểu "nổi": một viên thuốc bo tròn, có bóng, nằm đè lên nội dung và đứng yên
 * khi cuộn (thay cho thanh tab native đặc kín mép dưới).
 *
 * - Chỉ icon, bỏ chữ — tab đang chọn tô nền `brand-soft` hình viên thuốc nằm ngang + icon màu thương hiệu.
 * - Tab Tài khoản hiện ảnh đại diện thật của người dùng, đang chọn thì có viền thương hiệu.
 * - 4 ô đầu đổi theo vai trò (`tabBarSlots`): có ô là tab, có ô mở màn Stack (vd Lịch trình của học
 *   viên). Tab đang mở mà không có trên thanh (vào từ menu, vd Trang chủ của giáo viên) thì THAY CHỖ
 *   ô Tài khoản — y như thanh ở màn Stack — để luôn nhìn ra mình đang ở đâu.
 */
export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const { role, slots } = useTabBarSlots();
  const staff = isStaffRole(role);
  const focusedName = state.routes[state.index]?.name;

  const tabItem = (name: string): TabItemSpec | null => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return null;
    const focused = focusedName === name;
    const meta = ICONS[name] ?? ICONS.index;
    return {
      key: route.key,
      icon: meta.on,
      iconOff: meta.off,
      label: name === 'account' ? meta.label : tabLabel(name, staff),
      focused,
      avatar: name === 'account',
      badge: name === 'chat' ? -1 : undefined, // -1 = lấy số chưa đọc thật ở TabBar
      onPress: () => {
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
      },
      onLongPress: () => navigation.emit({ type: 'tabLongPress', target: route.key }),
    };
  };

  const items = slots.flatMap((slot): TabItemSpec[] => {
    if (slot.tab) return [tabItem(slot.tab)].filter((x): x is TabItemSpec => !!x);
    const route = slot.feature!.route!;
    return [featureItem(slot.feature!, false, () => router.push(route as never))];
  });
  const inBar = slots.some((s) => s.tab === focusedName);
  const last = tabItem(!inBar && focusedName && focusedName !== 'account' ? focusedName : 'account');
  if (last) items.push(last);
  return <TabBar items={items} />;
}

/**
 * Thanh tab cho màn MỞ TỪ MENU (nằm ngoài navigator tab).
 *
 * Người dùng muốn thanh này có mặt ở mọi màn mở từ menu để đi tiếp đâu cũng được, không phải quay
 * lại trước. Màn đang mở là 1 ô của vai trò (vd Lịch trình của học viên) thì tô ô đó; không thì nó
 * THAY CHỖ icon cuối (Tài khoản) — vẫn đủ 5 ô, nhìn ra ngay mình đang ở đâu. Vào Tài khoản thì bấm ☰.
 */
export function StackTabBar() {
  const pathname = usePathname();
  const feature = featureForPath(pathname);
  if (!feature) return null;
  return <StackTabBarInner feature={feature} />;
}

function StackTabBarInner({ feature }: { feature: AppFeature }) {
  const { role, slots } = useTabBarSlots();
  const staff = isStaffRole(role);
  const onSlot = slots.some((s) => s.feature?.route === feature.route);

  const items = slots.map((slot): TabItemSpec => {
    if (slot.tab) {
      const meta = ICONS[slot.tab];
      return {
        key: slot.tab,
        icon: meta.on,
        iconOff: meta.off,
        label: tabLabel(slot.tab, staff),
        focused: false,
        badge: slot.tab === 'chat' ? -1 : undefined,
        // `navigate` chứ không `push`: quay về tab đang có sẵn thay vì chồng thêm một bản nữa
        onPress: () => router.navigate(TAB_PATHS[slot.tab!] as never),
      };
    }
    const f = slot.feature!;
    const focused = f.route === feature.route;
    return featureItem(f, focused, () => {
      if (focused) return;
      // Đang ở 1 ô màn Stack mà bấm ô màn Stack khác → THAY màn (như đổi tab), không chồng thêm
      // làm nút quay lại phải bấm qua từng màn đã ghé.
      if (onSlot) router.replace(f.route as never);
      else router.navigate(f.route as never);
    });
  });
  items.push(
    onSlot
      ? {
          key: 'account',
          icon: ICONS.account.on,
          iconOff: ICONS.account.off,
          label: ICONS.account.label,
          focused: false,
          avatar: true,
          onPress: () => router.navigate('/account'),
        }
      : featureItem(feature, true, () => undefined),
  );
  return <TabBar items={items} />;
}

function TabBar({ items }: { items: TabItemSpec[] }) {
  const insets = useSafeAreaInsets();
  const brand = useThemeColor('brand');
  const brandSoft = useThemeColor('brand-soft');
  const muted = useThemeColor('muted');
  const danger = useThemeColor('danger');
  const user = useAuthStore((s) => s.user);
  const avatarUri = useMediaUrl(user?.avatar);
  const unread = useUnreadTotal();

  return (
    <View
      pointerEvents="box-none"
      className="absolute bottom-0 left-0 right-0"
      style={{ paddingHorizontal: 12, paddingBottom: Math.max(insets.bottom, 6) + BAR_GAP }}>
      <View
        className="flex-row items-center justify-between border border-border bg-surface"
        style={{
          height: BAR_HEIGHT,
          borderRadius: BAR_HEIGHT / 2,
          paddingHorizontal: 6,
          // Bóng đổ cho cảm giác nổi — iOS dùng shadow*, Android dùng elevation.
          ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
            default: { elevation: 12 },
          }),
        }}>
        {items.map((item) => {
          const badge = item.badge === -1 ? unread : (item.badge ?? 0);
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityState={{ selected: item.focused }}
              accessibilityLabel={item.label}
              onPress={item.onPress}
              onLongPress={item.onLongPress}
              className="flex-1 items-center justify-center active:opacity-60">
              {/* Khung của 1 tab: rộng bằng ô tab (có trần) để viên thuốc nền kéo dài theo. */}
              <View
                style={{
                  // 92% chứ không 100%: máy màn hình nhỏ thì viên thuốc vẫn còn khe hở hai bên,
                  // không chạm sát mép ô tab bên cạnh.
                  width: '92%',
                  maxWidth: PILL_MAX_W,
                  height: PILL_H,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {/* Nền là LỚP RIÊNG KHÔNG CHỨA GÌ: để chung 1 view với huy hiệu số tràn ra ngoài
                    (tab Chat) thì Android vẽ bo góc sai thành hình vuông. Viết hết bằng style (kể cả
                    màu nền) — trộn nền của className với bo tròn bằng style cũng ra hình vuông. */}
                {item.focused ? (
                  <View
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 0,
                      bottom: 0,
                      borderRadius: PILL_H / 2,
                      backgroundColor: brandSoft,
                    }}
                  />
                ) : null}

                {/* Ô bọc icon giữ kích thước cố định → huy hiệu số vẫn nằm sát icon dù nền rộng ra */}
                <View style={{ width: ICON_BOX, height: ICON_BOX, alignItems: 'center', justifyContent: 'center' }}>
                  {item.avatar && avatarUri ? (
                    // Chỉ vẽ ảnh khi ĐÃ có link đầy đủ (có media token); chưa có thì dùng icon người
                    // như các tab khác, không để ô trống.
                    <View
                      style={{
                        borderRadius: ICON_BOX / 2,
                        overflow: 'hidden',
                        borderWidth: item.focused ? 2 : 0,
                        borderColor: brand,
                      }}>
                      <Avatar
                        name={user?.name}
                        uri={avatarUri}
                        cacheKey={mediaCacheKey(user?.avatar)}
                        size={item.focused ? 26 : 28}
                      />
                    </View>
                  ) : (
                    <Ionicons name={item.focused ? item.icon : item.iconOff} size={22} color={item.focused ? brand : muted} />
                  )}

                  {badge > 0 ? (
                    <View
                      style={{
                        position: 'absolute',
                        right: -2,
                        top: -1,
                        minWidth: 16,
                        height: 16,
                        paddingHorizontal: 4,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: danger,
                      }}>
                      <Text className="text-[9px] font-bold text-white">{badge > 99 ? '99+' : badge}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
