import { Image } from 'expo-image';
import { useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
/** Ở mức 1x, vuốt dọc quá ngưỡng này thì đóng trình xem ảnh. */
const DISMISS_PX = 120;

/**
 * Ảnh xem toàn màn hình: chụm 2 ngón phóng to đúng chỗ ngón tay, chạm đúp phóng/thu,
 * kéo khi đang phóng to, vuốt dọc (ở 1x) để đóng. Dùng chung iOS + Android (ScrollView zoom
 * chỉ có trên iOS). Phải nằm trong GestureHandlerRootView — Modal trên Android là cây riêng.
 */
export function ZoomableImage({
  uri,
  onDismiss,
  pager,
  onZoomChange,
}: {
  uri: string;
  onDismiss: () => void;
  /**
   * Nằm trong danh sách vuốt ngang (thư viện ảnh): ở 1x chỉ bắt kéo DỌC (để đóng), nhường vuốt ngang
   * cho danh sách chuyển ảnh; đã phóng to thì kéo tự do như thường.
   */
  pager?: boolean;
  onZoomChange?: (zoomed: boolean) => void;
}) {
  const { width, height } = useWindowDimensions();
  const [zoomed, setZoomed] = useState(false);
  const reportZoom = (z: boolean) => {
    setZoomed(z);
    onZoomChange?.(z);
  };

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);

  const clampTranslate = (s: number) => {
    'worklet';
    const maxX = (width * (s - 1)) / 2;
    const maxY = (height * (s - 1)) / 2;
    tx.value = withTiming(Math.min(maxX, Math.max(-maxX, tx.value)));
    ty.value = withTiming(Math.min(maxY, Math.max(-maxY, ty.value)));
  };

  // KHÔNG gọi scheduleOnRN ở đây: hàm JS (reportZoom) bị bắt trong worklet LỒNG không được chuyển
  // sang đúng → runtime văng "Cannot read property 'split' of undefined". Người gọi tự báo ngay trong
  // callback của cử chỉ.
  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    savedScale.value = 1;
    tx.value = withTiming(0);
    ty.value = withTiming(0);
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      savedScale.value = scale.value;
      savedTx.value = tx.value;
      savedTy.value = ty.value;
      originX.value = e.focalX - width / 2;
      originY.value = e.focalY - height / 2;
    })
    .onUpdate((e) => {
      const s = Math.min(MAX_SCALE, Math.max(1, savedScale.value * e.scale));
      const k = s / savedScale.value;
      scale.value = s;
      // Giữ điểm dưới ngón tay đứng yên khi phóng to
      tx.value = originX.value - (originX.value - savedTx.value) * k;
      ty.value = originY.value - (originY.value - savedTy.value) * k;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) {
        reset();
        scheduleOnRN(reportZoom, false);
      } else {
        clampTranslate(scale.value);
        scheduleOnRN(reportZoom, true);
      }
    });

  // Callback phải gắn THẲNG vào chuỗi Gesture.Pan()… thì plugin worklets mới tự biến thành worklet
  // (gắn sau biểu thức điều kiện là RNGH cảnh báo "None of the callbacks… are worklets").
  const pan = Gesture.Pan()
    .averageTouches(true)
    .onStart(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    })
    .onUpdate((e) => {
      if (scale.value > 1) {
        tx.value = savedTx.value + e.translationX;
        ty.value = savedTy.value + e.translationY;
      } else {
        ty.value = e.translationY; // 1x: kéo dọc để đóng
      }
    })
    .onEnd((e) => {
      if (scale.value > 1) {
        clampTranslate(scale.value);
      } else if (Math.abs(e.translationY) > DISMISS_PX || Math.abs(e.velocityY) > 1200) {
        scheduleOnRN(onDismiss);
      } else {
        ty.value = withTiming(0);
      }
    });

  // Trong thư viện ảnh, ở 1x: chỉ nhận kéo dọc (để đóng), vuốt ngang nhường cho danh sách chuyển ảnh
  if (pager && !zoomed) pan.activeOffsetY([-12, 12]).failOffsetX([-12, 12]);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1) {
        reset();
        scheduleOnRN(reportZoom, false);
        return;
      }
      const s = DOUBLE_TAP_SCALE;
      const ox = e.x - width / 2;
      const oy = e.y - height / 2;
      scale.value = withTiming(s);
      savedScale.value = s;
      scheduleOnRN(reportZoom, true);
      const maxX = (width * (s - 1)) / 2;
      const maxY = (height * (s - 1)) / 2;
      tx.value = withTiming(Math.min(maxX, Math.max(-maxX, -ox * (s - 1))));
      ty.value = withTiming(Math.min(maxY, Math.max(-maxY, -oy * (s - 1))));
    });

  const gesture = Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
    // Kéo xuống để đóng: mờ dần theo quãng kéo (chỉ khi ở 1x)
    opacity: scale.value > 1 ? 1 : 1 - Math.min(0.6, Math.abs(ty.value) / 400),
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height }, style]}>
        <Image source={{ uri }} style={{ width, height }} contentFit="contain" />
      </Animated.View>
    </GestureDetector>
  );
}
