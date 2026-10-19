import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * Tên biểu tượng dùng trong app: tên Ionicons, cộng vài biểu tượng antd mà web (PWA chat-task /
 * class-fe) dùng và Ionicons không có bản giống: `pushpin` (PushpinOutlined — đinh ghim nghiêng, khác
 * hẳn `pin` của Ionicons trông như kim chỉ đường) và `flag-filled` (FlagFilled — cờ gắn tin).
 */
export type AppIconName = ComponentProps<typeof Ionicons>['name'] | 'pushpin' | 'flag-filled';

/**
 * Đường vẽ PushpinOutlined chép nguyên từ @ant-design/icons-svg (viewBox "64 64 896 896") — bộ font
 * AntDesign của @expo/vector-icons chỉ có bản TÔ ĐẶC, còn PWA dùng bản NÉT VIỀN.
 */
const PUSHPIN_OUTLINED =
  'M878.3 392.1L631.9 145.7c-6.5-6.5-15-9.7-23.5-9.7s-17 3.2-23.5 9.7L423.8 306.9c-12.2-1.4-24.5-2-36.8-2-73.2 0-146.4 24.1-206.5 72.3a33.23 33.23 0 00-2.7 49.4l181.7 181.7-215.4 215.2a15.8 15.8 0 00-4.6 9.8l-3.4 37.2c-.9 9.4 6.6 17.4 15.9 17.4.5 0 1 0 1.5-.1l37.2-3.4c3.7-.3 7.2-2 9.8-4.6l215.4-215.4 181.7 181.7c6.5 6.5 15 9.7 23.5 9.7 9.7 0 19.3-4.2 25.9-12.4 56.3-70.3 79.7-158.3 70.2-243.4l161.1-161.1c12.9-12.8 12.9-33.8 0-46.8zM666.2 549.3l-24.5 24.5 3.8 34.4a259.92 259.92 0 01-30.4 153.9L262 408.8c12.9-7.1 26.3-13.1 40.3-17.9 27.2-9.4 55.7-14.1 84.7-14.1 9.6 0 19.3.5 28.9 1.6l34.4 3.8 24.5-24.5L608.5 224 800 415.5 666.2 549.3z';

/** FlagFilled của @ant-design/icons-svg (cùng viewBox) */
const FLAG_FILLED =
  'M880 305H624V192c0-17.7-14.3-32-32-32H184v-40c0-4.4-3.6-8-8-8h-56c-4.4 0-8 3.6-8 8v784c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8V640h248v113c0 17.7 14.3 32 32 32h416c17.7 0 32-14.3 32-32V337c0-17.7-14.3-32-32-32z';

export function AppIcon({ name, size, color, style }: { name: AppIconName; size: number; color: string; style?: StyleProp<TextStyle> }) {
  if (name === 'pushpin' || name === 'flag-filled') {
    return (
      <Svg width={size} height={size} viewBox="64 64 896 896" style={style as never}>
        <Path d={name === 'pushpin' ? PUSHPIN_OUTLINED : FLAG_FILLED} fill={color} />
      </Svg>
    );
  }
  return <Ionicons name={name} size={size} color={color} style={style} />;
}
