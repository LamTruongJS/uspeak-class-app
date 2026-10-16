import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, usePathname, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Animated,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { Avatar } from '@/components/ui/avatar';
import { HOME_SHORTCUT_3D_ICONS } from '@/constants/three-d-icons';
import { useMyPermissionCodes } from '@/features/chat/api';
import { fold } from '@/features/chat/mentions';
import { GROUP_LABELS, ROLE_NAMES, featuresForUser, type AppFeature, type FeatureGroup } from '@/navigation/features';
import { openFeature } from '@/navigation/open-feature';
import { mediaCacheKey, useMediaUrl } from '@/lib/media';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

const GROUP_ORDER: FeatureGroup[] = ['learn', 'practice', 'community', 'teach', 'grading', 'admin', 'account'];

interface MenuState {
  open: boolean;
}

const useMenuStore = create<MenuState>()(() => ({ open: false }));

/** Mở menu tổng — gọi được từ bất cứ đâu (store, không phải hook). */
export function openAppMenu() {
  useMenuStore.setState({ open: true });
}

/**
 * Nút ☰ đặt ở đầu header các màn chính. `onImage` dùng cho header có ảnh nền (hero trang chủ):
 * nền đen mờ + viền trắng để nhìn rõ trên mọi tấm ảnh.
 */
export function MenuButton({ onImage }: { onImage?: boolean }) {
  const foreground = useThemeColor('foreground');
  return (
    <Pressable
      onPress={openAppMenu}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Mở menu"
      className={`h-10 w-10 items-center justify-center rounded-full active:opacity-70 ${
        onImage ? 'border border-white/25 bg-black/30' : 'bg-surface-muted'
      }`}>
      <Ionicons name="menu" size={22} color={onImage ? '#ffffff' : foreground} />
    </Pressable>
  );
}

/**
 * Dải bắt cử chỉ vuốt mở menu: từ mép trái vào 72dp.
 *
 * Android nuốt ~20dp sát mép cho cử chỉ Back của hệ điều hành — vuốt từ ĐÚNG mép là thoát app chứ
 * không mở menu (thử 16/10/2026). Không chặn được chuyện đó nếu không viết native (androidx
 * DrawerLayout tự gọi setSystemGestureExclusionRects, RN không có API này), nên để dải rộng: phần
 * hệ thống lấy thì nó lấy, vuốt từ nhích vào một chút là ra menu. Máy dùng 3 nút và iOS ăn cả dải.
 *
 * `hitSlop` của RNGH chỉ hiểu `left: 0` + `width` (left > 0 KHÔNG dời điểm bắt đầu, cử chỉ không
 * nhận nữa — đã thử).
 */
const EDGE = { left: 0, width: 72 };

/**
 * Vuốt từ MÉP TRÁI để mở menu — bọc quanh cụm tab ở `(tabs)/_layout.tsx`.
 *
 * Chỉ bọc các màn trong thanh tab, KHÔNG bọc toàn app: ở màn con (phòng chat, màn chấm bài…) vuốt
 * mép trái là thói quen "quay lại", mở menu ở đó vừa lạc lõng vừa tranh chấp với cử chỉ sẵn có.
 *
 * Dùng `hitSlop` của cử chỉ chứ KHÔNG đặt một ô trong suốt đè lên mép trái: ô đó sẽ nuốt mọi cú
 * chạm rơi vào dải đó (nút ☰, mép trái các thẻ). Cử chỉ chỉ nhận khi đã kéo ngang > 14dp và không
 * nghiêng dọc, nên chạm thường và cuộn dọc vẫn đi thẳng xuống nội dung bên dưới.
 */
export function MenuEdgeSwipe({ children }: { children: ReactNode }) {
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .hitSlop(EDGE)
        .activeOffsetX(14)
        .failOffsetY([-20, 20])
        // onStart chạy lúc cử chỉ ĐƯỢC NHẬN (đã qua ngưỡng 14dp) — mở ngay từ lúc đang kéo,
        // không đợi nhả tay, nên cảm giác bám theo ngón như app Facebook.
        .onStart(() => openAppMenu()),
    [],
  );
  return (
    <GestureDetector gesture={swipe}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  );
}

/**
 * Cụm "nút + tiêu đề" của header các màn Stack.
 *
 * Vẽ CẢ HAI trong ô tiêu đề (`headerTitle`) chứ không để nút ở `headerLeft`: native-stack chừa
 * khoảng cách cố định giữa ô trái và ô tiêu đề (~38dp), chỉnh không được vì `headerTitleStyle` chỉ
 * nhận font/màu, không nhận margin. Gom vào một cụm thì tự đặt `gap` bao nhiêu cũng được.
 *
 * `menu`: màn mở từ menu → nút ☰ (bấm mở lại menu). Còn lại → mũi tên quay lại, tự vẽ vì
 * `headerBackVisible: false` đã tắt nút back của hệ thống.
 */
export function HeaderRow({ title, menu }: { title?: ReactNode; menu?: boolean }) {
  const navigation = useNavigation();
  const foreground = useThemeColor('foreground');
  const canGoBack = navigation.canGoBack();
  return (
    <View className="flex-row items-center gap-2">
      {menu ? (
        <MenuButton />
      ) : canGoBack ? (
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Quay lại"
          className="-ml-1.5 h-10 w-10 items-center justify-center rounded-full active:opacity-60">
          <Ionicons name="arrow-back" size={24} color={foreground} />
        </Pressable>
      ) : null}
      <Text className="flex-1 text-[22px] font-bold text-foreground" numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

/** Options chung cho MỌI màn Stack — nút back tự vẽ nằm sát tiêu đề. */
export const stackHeaderOptions = {
  headerBackVisible: false,
  headerTitleAlign: 'left' as const,
  headerShadowVisible: false,
  headerTitle: ({ children }: { children: string }) => <HeaderRow title={children} />,
};

/**
 * Header cho màn MỞ TỪ MENU: thay mũi tên back bằng nút ☰.
 *
 * Màn mở từ menu vẫn là màn chồng lên màn cũ, nhưng để back thì đang đứng ở đó muốn nhảy sang mục
 * menu khác phải back ra trước — nên bỏ mũi tên, để ☰ đúng chỗ cũ giống các màn trong thanh tab.
 * Quay lại vẫn được bằng cử chỉ vuốt (iOS) và nút/cử chỉ back của máy (Android).
 */
export const menuScreenOptions = {
  ...stackHeaderOptions,
  headerTitle: ({ children }: { children: string }) => <HeaderRow title={children} menu />,
};

/**
 * Menu tổng trượt từ trái (kiểu app Facebook) — gắn MỘT LẦN ở `app/_layout.tsx`.
 *
 * Vì sao là ngăn kéo chứ không phải thêm tab: app có gần 40 màn nhưng thanh dưới chỉ chứa được 5.
 * Trước đó mỗi màn tự bày phần còn lại theo kiểu riêng (hàng nút tròn ở màn Nhận xét bài, danh sách
 * ở màn Tài khoản) nên cùng một tính năng mỗi chỗ một hình. Giờ gom hết về một chỗ, mở từ bất kỳ
 * màn chính nào bằng cùng một nút ở cùng một vị trí.
 */
export function AppMenuDrawer() {
  const open = useMenuStore((s) => s.open);
  if (!open) return null;
  return <Drawer onClose={() => useMenuStore.setState({ open: false })} />;
}

function Drawer({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(width * 0.86, 340);
  const muted = useThemeColor('muted');
  const user = useAuthStore((s) => s.user);
  const avatarUri = useMediaUrl(user?.avatar);
  const permissions = useMyPermissionCodes();
  const pathname = usePathname();
  const [search, setSearch] = useState('');
  // Giá trị động phải tạo bằng useState, không useRef: React Compiler cấm đọc `.current` lúc render
  const [anim] = useState(() => new Animated.Value(0));
  const [closing, setClosing] = useState(false);

  const features = featuresForUser(user?.role_code, permissions.data);
  const query = fold(search.trim());
  const visible = useMemo(() => {
    if (!query) return features;
    const words = query.split(/\s+/).filter(Boolean);
    return features.filter((f) => {
      const hay = fold(`${f.label} ${GROUP_LABELS[f.group]}`);
      return words.every((w) => hay.includes(w));
    });
  }, [features, query]);

  useEffect(() => {
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 24, stiffness: 230 }).start();
  }, [anim]);

  // Đóng xong mới gỡ khỏi cây: gỡ thẳng thì ngăn kéo biến mất cụp một cái, không thấy nó trượt ra.
  const close = () => {
    if (closing) return;
    setClosing(true);
    Animated.timing(anim, { toValue: 0, duration: 170, useNativeDriver: true }).start(() => onClose());
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  /** Đóng ngăn kéo TRƯỚC rồi mới đi: điều hướng lúc modal còn mở thì màn mới nằm dưới lớp phủ. */
  const go = (run: () => void) => {
    close();
    setTimeout(run, 190);
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <Animated.View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', opacity: anim }}>
        <Pressable className="absolute inset-0" onPress={close} accessibilityLabel="Đóng menu" />
        <Animated.View
          className="h-full bg-surface"
          style={{
            width: panelWidth,
            paddingTop: insets.top,
            transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [-panelWidth, 0] }) }],
          }}>
          {/* ── Người dùng ── */}
          <Pressable
            onPress={() => go(() => router.navigate('/account'))}
            className="flex-row items-center gap-3 border-b border-border px-4 py-3.5 active:bg-surface-muted">
            <Avatar name={user?.name} uri={avatarUri} cacheKey={mediaCacheKey(user?.avatar)} size={46} />
            <View className="flex-1">
              <Text className="text-[15.5px] font-bold text-foreground" numberOfLines={1}>
                {user?.name || 'Người dùng'}
              </Text>
              <Text className="text-[12.5px] text-muted" numberOfLines={1}>
                {ROLE_NAMES[user?.role_code ?? ''] ?? 'Xem trang cá nhân'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={muted} />
          </Pressable>

          {/* ── Tìm nhanh ── */}
          <View className="px-3 py-2.5">
            <View className="h-10 flex-row items-center gap-2 rounded-full bg-surface-muted px-3.5">
              <Ionicons name="search" size={16} color={muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Tìm tính năng…"
                placeholderTextColor={muted}
                autoCorrect={false}
                returnKeyType="search"
                className="flex-1 text-[14.5px] text-foreground"
              />
              {search ? (
                <Pressable hitSlop={8} onPress={() => setSearch('')} accessibilityLabel="Xoá ô tìm">
                  <Ionicons name="close-circle" size={16} color={muted} />
                </Pressable>
              ) : null}
            </View>
          </View>

          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            {visible.length === 0 ? (
              <Text className="px-4 py-6 text-center text-[13.5px] text-muted">Không có tính năng nào khớp</Text>
            ) : (
              GROUP_ORDER.map((group) => {
                const items = visible.filter((f) => f.group === group);
                if (!items.length) return null;
                return (
                  <View key={group}>
                    <Text className="px-4 pb-1 pt-3.5 text-[11.5px] font-bold uppercase tracking-wide text-muted">
                      {GROUP_LABELS[group]}
                    </Text>
                    {items.map((f) => (
                      <MenuRow key={f.key} feature={f} active={isActive(f, pathname)} onPress={() => go(() => openFeature(f))} />
                    ))}
                  </View>
                );
              })
            )}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/**
 * Mục đang mở — tô nền để biết mình đang ở đâu trong app.
 * `/` là trang chủ nên chỉ khớp chính xác, không thì mục nào cũng sáng.
 */
function isActive(feature: AppFeature, pathname: string) {
  const route = feature.route?.split('?')[0];
  if (!route || feature.status !== 'ready') return false;
  if (route === '/') return pathname === '/';
  return pathname === route || pathname.startsWith(`${route}/`);
}

function MenuRow({ feature, active, onPress }: { feature: AppFeature; active: boolean; onPress: () => void }) {
  const foreground = useThemeColor('foreground');
  const brand = useThemeColor('brand');
  const icon3d = HOME_SHORTCUT_3D_ICONS[feature.key];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`flex-row items-center gap-2.5 px-3 py-2 active:bg-surface-muted ${active ? 'bg-brand-soft' : ''}`}>
      <View className={`h-9 w-9 items-center justify-center overflow-hidden ${icon3d ? '' : 'rounded-xl bg-surface-muted'}`}>
        {icon3d ? (
          <Image source={icon3d} style={{ width: 32, height: 32 }} contentFit="contain" accessible={false} />
        ) : (
          <Ionicons name={feature.icon} size={18} color={brand} />
        )}
      </View>
      <Text
        className={`flex-1 text-[14.5px] ${active ? 'font-bold text-brand' : 'font-medium'}`}
        style={active ? undefined : { color: foreground }}
        numberOfLines={1}>
        {feature.label}
      </Text>
      {feature.status === 'web' ? (
        <View className="rounded-full bg-info-soft px-1.5 py-0.5">
          <Text className="text-[10px] font-semibold text-info">Web</Text>
        </View>
      ) : null}
      {feature.status === 'planned' ? (
        <View className="rounded-full bg-surface-muted px-1.5 py-0.5">
          <Text className="text-[10px] font-semibold text-muted">Sắp có</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
