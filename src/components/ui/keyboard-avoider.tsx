import { useEffect, useState, type ReactNode } from 'react';
import { Dimensions, Keyboard, LayoutAnimation, Platform, View, type KeyboardEvent, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Đẩy nội dung lên khi bàn phím mở — dùng cho mọi màn có ô nhập (màn kéo dài tới đáy màn hình).
 *
 * Vì sao tự làm thay KeyboardAvoidingView:
 * - Từ SDK 54 Android luôn vẽ tràn viền (edge-to-edge) → cửa sổ KHÔNG co khi bàn phím mở.
 * - KeyboardAvoidingView so khung của nó (toạ độ cửa sổ) với bàn phím (toạ độ màn hình); trong
 *   Expo Go Android hai hệ lệch nhau ~50dp → đệm thiếu đúng bằng chiều cao ô soạn tin, ô nhập
 *   nằm khuất sau bàn phím (đo thật trên Pixel 8: cần 336dp, KAV chỉ đệm 286dp).
 * Màn hình nào dùng component này cũng chạm đáy màn hình, nên phần bị che = chiều cao màn hình
 * − mép trên bàn phím, không cần đo vị trí khung.
 */
export function KeyboardAvoider({
  children,
  className = 'flex-1',
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const onShow = (e: KeyboardEvent) => {
      if (ios) LayoutAnimation.configureNext(LayoutAnimation.create(e.duration || 250, 'keyboard', 'opacity'));
      setInset(Math.max(0, Dimensions.get('screen').height - e.endCoordinates.screenY));
    };
    const onHide = (e: KeyboardEvent) => {
      if (ios) LayoutAnimation.configureNext(LayoutAnimation.create(e.duration || 250, 'keyboard', 'opacity'));
      setInset(0);
    };
    const subs = [
      Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', onShow),
      Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', onHide),
      // Đổi bàn phím (emoji ↔ chữ) đổi chiều cao mà không có sự kiện show
      ...(ios ? [Keyboard.addListener('keyboardWillChangeFrame', onShow)] : []),
    ];
    return () => subs.forEach((s) => s.remove());
  }, []);

  return (
    <View className={className} style={[style, { paddingBottom: inset }]}>
      {children}
    </View>
  );
}
