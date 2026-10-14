import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ComponentProps, type RefObject } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useStableCallback } from '@/lib/use-stable-callback';
import { useIsDark } from '@/theme/theme-preference';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Bộ khung "ảnh bìa + thanh trên trong suốt + tab DÍNH" dùng chung cho các màn chi tiết lớp
 * (học viên: app/class/[id].tsx, giáo viên: app/teach/[id].tsx).
 *
 * - Cả màn là MỘT Animated.FlatList; phần đầu (ảnh bìa + thẻ) là ListHeaderComponent, tiếp theo là
 *   khoảng trống cao TAB_H để chừa chỗ cho thanh tab.
 * - Thanh tab là lớp VẼ ĐÈ (FlatList chỉ dính được ở mép trên cùng, mà mép đó là thanh trên trong suốt):
 *   translateY nội suy từ vị trí cuộn, dừng ở mép dưới thanh trên cùng.
 * - Dùng Animated của React Native (native driver), KHÔNG dùng Reanimated: ref Animated.FlatList bên
 *   Reanimated không có scrollToOffset, và style Reanimated bắt giá trị JS đổi sau onLayout bị strict mode
 *   báo "Reading from value during component render" (xem docs/HANDOFF.md).
 */
export const BAR_H = 52;
export const TAB_H = 52;

/**
 * `listRef` do màn tự tạo (useRef) rồi gắn vào FlatList — để object trả về không chứa ref (lint
 * React Compiler). Màn chỉ cuộn dọc bình thường (không có tab dính) thì bỏ trống tham số này.
 */
export function useCollapsingHeader<Row>(listRef?: RefObject<FlatList<Row> | null>) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const topBar = insets.top + BAR_H;
  const [heroH, setHeroH] = useState(0);
  const [listH, setListH] = useState(winH);
  const collapseAt = Math.max(0, heroH - topBar);
  const [scrollY] = useState(() => new Animated.Value(0));
  const offset = useRef(0);
  const [collapsed, setCollapsed] = useState(false);
  const onHeroLayout = (e: LayoutChangeEvent) => setHeroH(Math.round(e.nativeEvent.layout.height));

  const onScrollJs = useStableCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    offset.current = y;
    // Đổi màu chữ thanh trạng thái khi ảnh bìa đã khuất — setState chỉ lúc đổi trạng thái
    const c = heroH > 0 && y > collapseAt - 24;
    setCollapsed((prev) => (prev === c ? prev : c));
  });
  const [onScroll] = useState(() =>
    Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true, listener: onScrollJs }),
  );

  const fadeStart = Math.max(0, collapseAt - 70);
  const fadeEnd = Math.max(fadeStart + 1, collapseAt);
  const solidOpacity = scrollY.interpolate({ inputRange: [fadeStart, fadeEnd], outputRange: [0, 1], extrapolate: 'clamp' });
  const overImageOpacity = scrollY.interpolate({ inputRange: [fadeStart, fadeEnd], outputRange: [1, 0], extrapolate: 'clamp' });
  const titleIn = scrollY.interpolate({ inputRange: [fadeEnd - 20, fadeEnd], outputRange: [0, 1], extrapolate: 'clamp' });
  const tabBarY = scrollY.interpolate({
    inputRange: [-1000, collapseAt],
    outputRange: [heroH + 1000, heroH - collapseAt],
    extrapolateRight: 'clamp',
  });

  /** Gọi sau khi đổi tab: đã cuộn qua ảnh bìa (hoặc `force`) thì đưa danh sách về chỗ tab dính. */
  const stick = (force = false) => {
    if (force || offset.current >= collapseAt - 1) {
      requestAnimationFrame(() => listRef?.current?.scrollToOffset({ offset: collapseAt, animated: force }));
    }
  };

  return {
    topBar,
    topInset: insets.top,
    bottomInset: insets.bottom,
    heroH,
    collapseAt,
    collapsed,
    onHeroLayout,
    onScroll,
    stick,
    /** Đặt vào FlatList: chiều cao thật để tab ít nội dung vẫn cuộn được tới chỗ dính */
    onListLayout: (e: LayoutChangeEvent) => setListH(Math.round(e.nativeEvent.layout.height)),
    minContentHeight: collapseAt + listH,
    solidOpacity,
    overImageOpacity,
    titleIn,
    tabBarStyle: {
      position: 'absolute' as const,
      left: 0,
      right: 0,
      top: 0,
      opacity: heroH > 0 ? 1 : 0,
      transform: [{ translateY: tabBarY }],
    },
  };
}

/** StatusBar riêng của màn ảnh bìa — chỉ khi màn đang hiện (màn đè lên dùng lại StatusBar của root). */
export function CoverStatusBar({ collapsed }: { collapsed: boolean }) {
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const dark = useIsDark();
  return focused ? <StatusBar style={collapsed ? (dark ? 'light' : 'dark') : 'light'} /> : null;
}

export interface TopBarAction {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  badge?: boolean;
}

const CIRCLE = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 20,
} as const;

/**
 * Thanh trên cùng: lúc đầu trong suốt (nút tròn nền tối trên ảnh bìa), cuộn qua ảnh thì nền hiện dần,
 * nút đổi sang icon thường và tiêu đề hiện ra — 2 lớp chồng nhau đổi độ mờ (native driver).
 */
export function CollapsingTopBar({
  title,
  header,
  actions = [],
}: {
  title: string;
  header: Pick<ReturnType<typeof useCollapsingHeader>, 'solidOpacity' | 'overImageOpacity' | 'titleIn' | 'topBar' | 'topInset'>;
  actions?: TopBarAction[];
}) {
  const fg = useThemeColor('foreground');
  const bg = useThemeColor('background');
  const border = useThemeColor('border');
  const { solidOpacity, overImageOpacity, titleIn } = header;

  const button = (a: TopBarAction) => (
    <Pressable
      key={a.label}
      accessibilityRole="button"
      accessibilityLabel={a.label}
      onPress={a.onPress}
      hitSlop={6}
      className="h-10 w-10 active:opacity-70">
      <Animated.View style={[CIRCLE, { backgroundColor: 'rgba(0,0,0,0.35)', opacity: overImageOpacity }]}>
        <Ionicons name={a.icon} size={21} color="#ffffff" />
      </Animated.View>
      <Animated.View style={[CIRCLE, { opacity: solidOpacity }]}>
        <Ionicons name={a.icon} size={21} color={fg} />
      </Animated.View>
      {a.badge ? <View className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border-2 border-surface bg-danger" /> : null}
    </Pressable>
  );

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: header.topBar }}>
      <Animated.View
        style={{ position: 'absolute', inset: 0, backgroundColor: bg, borderBottomWidth: 1, borderColor: border, opacity: solidOpacity }}
      />
      <View className="flex-1 flex-row items-center gap-2 px-3" style={{ paddingTop: header.topInset }}>
        {button({ icon: 'arrow-back', label: 'Quay lại', onPress: () => router.back() })}
        <Animated.Text
          style={{
            flex: 1,
            fontSize: 16.5,
            fontWeight: '700',
            color: fg,
            opacity: titleIn,
            transform: [{ translateY: titleIn.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
          }}
          numberOfLines={1}>
          {title}
        </Animated.Text>
        {actions.length ? actions.map(button) : <View className="h-10 w-10" />}
      </View>
    </View>
  );
}

export interface PillTab<T extends string> {
  value: T;
  label: string;
  /** Số đỏ (việc cần làm / chưa xem) */
  badge?: number;
}

/** Tab dạng viên thuốc cuộn ngang; tab đang chọn tự cuộn vào giữa tầm nhìn. */
export function PillTabBar<T extends string>({ items, value, onChange }: { items: PillTab<T>[]; value: T; onChange: (v: T) => void }) {
  const scrollRef = useRef<ScrollView>(null);
  const xs = useRef<Record<string, number>>({});

  useEffect(() => {
    const x = xs.current[value];
    if (x != null) scrollRef.current?.scrollTo({ x: Math.max(0, x - 40), animated: true });
  }, [value]);

  return (
    <View style={{ height: TAB_H }} className="justify-center border-b border-border bg-background">
      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="items-center gap-2 px-4">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onLayout={(e) => {
                xs.current[item.value] = e.nativeEvent.layout.x;
              }}
              onPress={() => onChange(item.value)}
              className={`h-9 flex-row items-center gap-1.5 rounded-full px-4 active:opacity-80 ${active ? 'bg-foreground' : 'bg-surface-muted'}`}>
              <Text className={`text-[14px] font-semibold ${active ? 'text-background' : 'text-muted'}`}>{item.label}</Text>
              {item.badge ? (
                <View className="min-w-[18px] items-center rounded-full bg-danger px-1.5 py-px">
                  <Text className="text-[10.5px] font-bold text-white">{item.badge > 99 ? '99+' : item.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
