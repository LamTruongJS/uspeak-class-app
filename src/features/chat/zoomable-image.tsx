import { Image, type ImageProps } from 'expo-image';
import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDecay, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
/** Ở 1x, kéo dọc quá ngưỡng này (hoặc vuốt nhanh) rồi thả là đóng. */
const DISMISS_PX = 110;
const DISMISS_VELOCITY = 900;
/** Lực cản khi kéo/chụm quá giới hạn (0 = cứng, 1 = không cản). */
const RUBBER = 0.35;

const SNAP = { duration: 240, easing: Easing.out(Easing.cubic) };
const SPRING = { damping: 22, stiffness: 240, mass: 0.7 };

/**
 * Ảnh xem toàn màn hình kiểu Facebook/Zalo — MỌI chuyển động chạy trên UI thread (reanimated), JS chỉ
 * được báo khi đổi trạng thái phóng to/đóng.
 *
 * - Chụm 2 ngón: phóng đúng chỗ ngón tay, di 2 ngón thì ảnh đi theo; chụm quá nhỏ (<1x) hay quá to
 *   (>5x) có lực cản rồi bật về.
 * - Đang phóng to: kéo 1 ngón có lực cản ở mép, thả tay ảnh trôi theo quán tính (withDecay) và nảy ở mép.
 *   Giới hạn kéo tính theo KHUNG ẢNH THẬT (ảnh ngang không kéo lên xuống vào vùng đen).
 * - Chụm xong nhấc 1 ngón vẫn kéo tiếp được, không phải nhấc cả hai.
 * - Chạm đúp: phóng 2.5x tại chỗ chạm / thu về.
 * - Ở 1x: kéo dọc → ảnh thu nhỏ dần + nền đen mờ dần lộ khung chat phía sau; thả quá ngưỡng là đóng.
 *
 * Bản cũ (đến 06/11/2026) giật vì: chạm đúp đặt `Exclusive` trước chụm/kéo → chụm/kéo phải chờ chạm đúp
 * thất bại mới chạy; không quán tính, không đàn hồi; giới hạn tính theo màn hình.
 *
 * Nền đen do component tự vẽ (để mờ dần khi vuốt đóng) → khung chứa (Modal) phải để nền trong suốt.
 * Phải nằm trong GestureHandlerRootView — Modal trên Android là cây view riêng.
 */
export function ZoomableImage({
  uri,
  source,
  onDismiss,
  pager,
  onZoomChange,
}: {
  uri?: string;
  /** Nguồn ảnh cần header (ảnh có token) — dùng thay `uri`. */
  source?: ImageProps['source'];
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
  // Đóng sau khi ảnh trượt khỏi màn (chờ phía JS, khỏi gọi hàm JS trong callback lồng của animation).
  const dismissSoon = () => setTimeout(onDismiss, 170);

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  /** Kích thước ảnh khi vừa khung (contain) ở 1x — cập nhật khi ảnh tải xong. */
  const fitW = useSharedValue(width);
  const fitH = useSharedValue(height);

  // Mốc lúc bắt đầu chụm
  const pinching = useSharedValue(false);
  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const startFx = useSharedValue(0);
  const startFy = useSharedValue(0);
  const lastFx = useSharedValue(0);
  const lastFy = useSharedValue(0);

  // Mốc của kéo (đặt lại mỗi khung hình đang chụm để nhấc 1 ngón là kéo tiếp liền mạch)
  const panTx = useSharedValue(0);
  const panTy = useSharedValue(0);
  const panBaseX = useSharedValue(0);
  const panBaseY = useSharedValue(0);
  /** Đang kéo-để-đóng (bắt đầu kéo khi ở 1x). */
  const dismissing = useSharedValue(false);

  const maxX = (s: number) => {
    'worklet';
    return Math.max(0, (fitW.value * s - width) / 2);
  };
  const maxY = (s: number) => {
    'worklet';
    return Math.max(0, (fitH.value * s - height) / 2);
  };
  const clamp = (v: number, m: number) => {
    'worklet';
    return Math.min(m, Math.max(-m, v));
  };
  /** Quá giới hạn thì chỉ đi được một phần quãng — cảm giác "dây chun". */
  const rubber = (v: number, m: number) => {
    'worklet';
    if (v > m) return m + (v - m) * RUBBER;
    if (v < -m) return -m + (v + m) * RUBBER;
    return v;
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      pinching.value = true;
      dismissing.value = false;
      startScale.value = scale.value;
      startTx.value = tx.value;
      startTy.value = ty.value;
      startFx.value = e.focalX - width / 2;
      startFy.value = e.focalY - height / 2;
    })
    .onUpdate((e) => {
      const raw = startScale.value * e.scale;
      const s = raw < 1 ? Math.max(0.6, 1 - (1 - raw) * 0.5) : raw > MAX_SCALE ? MAX_SCALE + (raw - MAX_SCALE) * 0.25 : raw;
      const k = s / startScale.value;
      const fx = e.focalX - width / 2;
      const fy = e.focalY - height / 2;
      lastFx.value = fx;
      lastFy.value = fy;
      scale.value = s;
      // Điểm ảnh nằm dưới tâm 2 ngón lúc bắt đầu luôn ở dưới tâm 2 ngón hiện tại
      tx.value = fx - (startFx.value - startTx.value) * k;
      ty.value = fy - (startFy.value - startTy.value) * k;
    })
    .onEnd(() => {
      const s = scale.value;
      const target = Math.min(MAX_SCALE, Math.max(1, s));
      if (target <= 1.01) {
        scale.value = withTiming(1, SNAP);
        tx.value = withTiming(0, SNAP);
        ty.value = withTiming(0, SNAP);
        scheduleOnRN(reportZoom, false);
        return;
      }
      // Bật về mức hợp lệ quanh tâm 2 ngón cuối cùng, rồi kéo vào trong giới hạn
      const k = target / s;
      const nx = clamp(lastFx.value - (lastFx.value - tx.value) * k, maxX(target));
      const ny = clamp(lastFy.value - (lastFy.value - ty.value) * k, maxY(target));
      if (target !== s) scale.value = withTiming(target, SNAP);
      tx.value = withTiming(nx, SNAP);
      ty.value = withTiming(ny, SNAP);
      scheduleOnRN(reportZoom, true);
    })
    .onFinalize(() => {
      pinching.value = false;
    });

  // Callback phải gắn THẲNG vào chuỗi Gesture.Pan()… thì plugin worklets mới tự biến thành worklet.
  const pan = Gesture.Pan()
    .onStart((e) => {
      panTx.value = tx.value;
      panTy.value = ty.value;
      panBaseX.value = e.translationX;
      panBaseY.value = e.translationY;
      dismissing.value = !pinching.value && scale.value <= 1.01;
    })
    .onUpdate((e) => {
      if (pinching.value) {
        // Chụm đang lo vị trí — chỉ dời mốc để lúc nhấc 1 ngón, kéo nối tiếp từ đúng chỗ hiện tại
        panTx.value = tx.value;
        panTy.value = ty.value;
        panBaseX.value = e.translationX;
        panBaseY.value = e.translationY;
        return;
      }
      const dx = e.translationX - panBaseX.value;
      const dy = e.translationY - panBaseY.value;
      if (dismissing.value) {
        tx.value = pager ? 0 : dx;
        ty.value = dy;
        return;
      }
      tx.value = rubber(panTx.value + dx, maxX(scale.value));
      ty.value = rubber(panTy.value + dy, maxY(scale.value));
    })
    .onEnd((e) => {
      if (pinching.value) return;
      if (dismissing.value) {
        if (Math.abs(ty.value) > DISMISS_PX || Math.abs(e.velocityY) > DISMISS_VELOCITY) {
          const dir = ty.value === 0 ? Math.sign(e.velocityY) || 1 : Math.sign(ty.value);
          ty.value = withTiming(dir * height, { duration: 180, easing: Easing.in(Easing.quad) });
          scheduleOnRN(dismissSoon);
        } else {
          tx.value = withSpring(0, SPRING);
          ty.value = withSpring(0, SPRING, () => {
            dismissing.value = false;
          });
        }
        return;
      }
      // Đang phóng to: trôi theo quán tính, chạm mép thì nảy. Đang ở ngoài mép thì kéo về.
      const mx = maxX(scale.value);
      const my = maxY(scale.value);
      tx.value =
        Math.abs(tx.value) > mx
          ? withTiming(clamp(tx.value, mx), SNAP)
          : withDecay({ velocity: e.velocityX, clamp: [-mx, mx], rubberBandEffect: true, rubberBandFactor: 0.7, deceleration: 0.997 });
      ty.value =
        Math.abs(ty.value) > my
          ? withTiming(clamp(ty.value, my), SNAP)
          : withDecay({ velocity: e.velocityY, clamp: [-my, my], rubberBandEffect: true, rubberBandFactor: 0.7, deceleration: 0.997 });
    });

  // Trong thư viện ảnh, ở 1x: chỉ nhận kéo dọc (để đóng), vuốt ngang nhường cho danh sách chuyển ảnh
  if (pager && !zoomed) pan.activeOffsetY([-10, 10]).failOffsetX([-14, 14]);
  else pan.minDistance(4);

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDistance(24)
    .onEnd((e) => {
      if (scale.value > 1.01) {
        scale.value = withTiming(1, SNAP);
        tx.value = withTiming(0, SNAP);
        ty.value = withTiming(0, SNAP);
        scheduleOnRN(reportZoom, false);
        return;
      }
      const s = DOUBLE_TAP_SCALE;
      scale.value = withTiming(s, SNAP);
      tx.value = withTiming(clamp(-(e.x - width / 2) * (s - 1), maxX(s)), SNAP);
      ty.value = withTiming(clamp(-(e.y - height / 2) * (s - 1), maxY(s)), SNAP);
      scheduleOnRN(reportZoom, true);
    });

  // Simultaneous (không Exclusive): chụm/kéo bắt đầu ngay, không phải chờ xem có phải chạm đúp không.
  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);

  const imageStyle = useAnimatedStyle(() => {
    // Kéo-để-đóng: ảnh thu nhỏ dần theo quãng kéo như Facebook
    const shrink = dismissing.value ? 1 - Math.min(0.3, (Math.abs(ty.value) / height) * 0.6) : 1;
    return { transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value * shrink }] };
  });
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: dismissing.value ? 1 - Math.min(1, Math.abs(ty.value) / (height * 0.45)) : 1,
  }));

  return (
    <GestureDetector gesture={gesture}>
      {/* Khung ngoài đứng yên để toạ độ ngón tay luôn tính theo màn hình */}
      <View style={{ width, height }} collapsable={false}>
        {/* Trùm dư lên/xuống: trên Android chiều cao cửa sổ không tính thanh điều hướng, mà Modal
            statusBarTranslucent phủ cả màn → nền chỉ bằng khung ảnh thì hở một dải ở đáy. */}
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', left: 0, right: 0, top: -height / 2, bottom: -height / 2, backgroundColor: '#000' }, backdropStyle]}
        />
        <Animated.View style={[{ width, height }, imageStyle]}>
          <Image
            source={source ?? { uri }}
            style={{ width, height }}
            contentFit="contain"
            onLoad={(e) => {
              const iw = e.source.width;
              const ih = e.source.height;
              if (!iw || !ih) return;
              const r = Math.min(width / iw, height / ih);
              fitW.value = iw * r;
              fitH.value = ih * r;
            }}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
