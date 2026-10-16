import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useThemeColor } from '@/theme/use-theme-color';

import { useUnreadNotificationCount } from './api';

/**
 * Nút chuông thông báo (bản mobile của NotificationBell trên thanh đầu trang web) — cùng cỡ, cùng kiểu
 * với nút ☰ (`MenuButton`) để đứng cạnh nhau: `onImage` cho phần ảnh bìa của Trang chủ.
 */
export function NotificationBellButton({ onImage }: { onImage?: boolean }) {
  const foreground = useThemeColor('foreground');
  const { data: count = 0 } = useUnreadNotificationCount();
  return (
    <Pressable
      onPress={() => router.push('/notifications')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={count ? `Thông báo, ${count} chưa đọc` : 'Thông báo'}
      className={`h-10 w-10 items-center justify-center rounded-full active:opacity-70 ${
        onImage ? 'border border-white/25 bg-black/30' : 'bg-surface-muted'
      }`}>
      <Ionicons name={count ? 'notifications' : 'notifications-outline'} size={21} color={onImage ? '#ffffff' : foreground} />
      {count > 0 ? (
        <View
          className="absolute items-center justify-center rounded-full bg-danger px-1"
          style={{ top: -3, right: -3, minWidth: 18, height: 18, borderWidth: 2, borderColor: onImage ? 'rgba(0,0,0,0.25)' : 'transparent' }}>
          <Text className="text-[10px] font-bold text-white">{count > 99 ? '99+' : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
