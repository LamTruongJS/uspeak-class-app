import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { useUnreadTotal } from '@/features/chat/api';
import { mediaCacheKey, useMediaUrl } from '@/lib/media';
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

/**
 * Khoảng trống phải chừa ở ĐÁY mọi màn trong tab: thanh menu nổi đè lên nội dung, không chừa thì
 * dòng cuối danh sách nằm khuất dưới thanh.
 */
export function useTabBarSpace() {
  const insets = useSafeAreaInsets();
  return BAR_HEIGHT + BAR_GAP * 2 + Math.max(insets.bottom, 6);
}

/**
 * Thanh menu dưới kiểu "nổi": một viên thuốc bo tròn, có bóng, nằm đè lên nội dung và đứng yên
 * khi cuộn (thay cho thanh tab native đặc kín mép dưới).
 *
 * - Chỉ icon, bỏ chữ — tab đang chọn tô nền `brand-soft` hình viên thuốc nằm ngang + icon màu thương hiệu.
 * - Tab Tài khoản hiện ảnh đại diện thật của người dùng, đang chọn thì có viền thương hiệu.
 */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
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
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = ICONS[route.name] ?? ICONS.index;
          const label = descriptors[route.key]?.options.title ?? meta.label;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
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
                {focused ? (
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
                  {route.name === 'account' && avatarUri ? (
                    // Chỉ vẽ ảnh khi ĐÃ có link đầy đủ (có media token); chưa có thì dùng icon người
                    // như các tab khác, không để ô trống.
                    <View
                      style={{
                        borderRadius: ICON_BOX / 2,
                        overflow: 'hidden',
                        borderWidth: focused ? 2 : 0,
                        borderColor: brand,
                      }}>
                      <Avatar name={user?.name} uri={avatarUri} cacheKey={mediaCacheKey(user?.avatar)} size={focused ? 26 : 28} />
                    </View>
                  ) : (
                    <Ionicons name={focused ? meta.on : meta.off} size={22} color={focused ? brand : muted} />
                  )}

                  {route.name === 'chat' && unread > 0 ? (
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
                      <Text className="text-[9px] font-bold text-white">{unread > 99 ? '99+' : unread}</Text>
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
