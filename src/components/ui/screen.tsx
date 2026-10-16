import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTabBarSpace } from '@/components/ui/floating-tab-bar';
import { MenuButton } from '@/features/navigation/app-menu';
import { useThemeColor } from '@/theme/use-theme-color';

interface ScreenProps {
  children: ReactNode;
  /** Tiêu đề lớn đầu trang (các tab không có header native) */
  title?: string;
  subtitle?: string;
  /** Kéo xuống để tải lại */
  onRefresh?: () => void;
  refreshing?: boolean;
  /** false khi bên trong đã có FlatList riêng */
  scroll?: boolean;
  /** Hiện nút ☰ mở menu tổng ở đầu tiêu đề (dùng cho các màn trong thanh tab) */
  menu?: boolean;
}

/** Khung màn hình chuẩn: nền theo theme, chừa tai thỏ/thanh trạng thái, kéo-để-tải-lại. */
export function Screen({
  children,
  title,
  subtitle,
  onRefresh,
  refreshing = false,
  scroll = true,
  menu = false,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const brand = useThemeColor('brand');
  // Thanh menu dưới là loại nổi, đè lên nội dung → chừa đúng chiều cao của nó ở đáy.
  const tabBarSpace = useTabBarSpace();

  const header = title ? (
    <View className="flex-row items-center gap-3 pb-4">
      {menu ? <MenuButton /> : null}
      <View className="flex-1">
        <Text className="text-[28px] font-extrabold tracking-tight text-foreground" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text className="text-[13.5px] text-muted">{subtitle}</Text> : null}
      </View>
    </View>
  ) : null;

  if (!scroll) {
    return (
      <View className="flex-1 bg-background px-4" style={{ paddingTop: insets.top + 12, paddingBottom: tabBarSpace }}>
        {header}
        {children}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: tabBarSpace }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={brand}
              colors={[brand]}
              progressViewOffset={insets.top}
            />
          ) : undefined
        }>
        {header}
        {children}
      </ScrollView>
      {/* Nền che sau thanh trạng thái: cuộn xuống thì nội dung không chạy đè dưới giờ / pin */}
      <View pointerEvents="none" className="absolute left-0 right-0 top-0 bg-background" style={{ height: insets.top }} />
    </View>
  );
}
