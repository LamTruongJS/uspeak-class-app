import { useEffect, useState } from 'react';
import { Dimensions, Keyboard, Platform, type KeyboardEvent } from 'react-native';

/**
 * Chiều cao bàn phím đang/vừa mở. Dùng để bảng biểu tượng chiếm ĐÚNG chỗ bàn phím vừa chiếm —
 * đổi qua lại giữa bàn phím và bảng emoji thì ô soạn tin đứng yên, không nhảy lên nhảy xuống.
 *
 * Nhớ ở cấp module: lần đầu mở bảng mà bàn phím chưa từng bật (vừa vào phòng đã bấm emoji) thì
 * vẫn có số đo của lần trước trong phiên, chỉ lần đầu tiên sau khi mở app mới dùng số mặc định.
 * Đo như `KeyboardAvoider`: chiều cao MÀN HÌNH trừ mép trên bàn phím — Android SDK 54+ vẽ tràn
 * viền nên toạ độ cửa sổ và toạ độ màn hình lệch nhau.
 */
let lastHeight = 300;

export function useKeyboardHeight() {
  const [height, setHeight] = useState(lastHeight);

  useEffect(() => {
    const onShow = (e: KeyboardEvent) => {
      const h = Math.max(0, Dimensions.get('screen').height - e.endCoordinates.screenY);
      // Bỏ qua số đo rác (bàn phím đang đóng, thanh gợi ý nổi) — dưới 120dp không phải bàn phím.
      if (h < 120) return;
      lastHeight = h;
      setHeight(h);
    };
    const sub = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', onShow);
    return () => sub.remove();
  }, []);

  return height;
}
