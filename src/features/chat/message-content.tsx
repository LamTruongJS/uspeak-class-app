import { Ionicons } from '@expo/vector-icons';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Modal, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDateTime } from '@/lib/format';
import { thumbCacheKey, useMediaToken, resolveMediaUrl, thumbMediaUrl } from '@/lib/media';
import { useThemeColor } from '@/theme/use-theme-color';

import { showToast } from '@/components/ui/toast';
import { useActionSheet } from '@/components/ui/action-sheet';

import { useLinkPreview } from './api';
import { fileIcon, formatSize } from './room-media';
import { parseContent } from './format';
import { emitWithAck } from './socket';
import type { ChatMessage, ChatMessageImage } from './types';
import { ZoomableImage } from './zoomable-image';

/** Độ rộng tối đa của bong bóng tin (phần trăm BỀ RỘNG DANH SÁCH) — dùng chung để ảnh không tràn. */
export const BUBBLE_MAX = 0.78;

/** Padding ngang của danh sách tin (`px-3`) và của bong bóng có nền (`px-3.5`). */
const LIST_PAD = 12;
const BUBBLE_PAD = 14;

/**
 * Bề rộng tối đa nội dung được phép chiếm. `inBubble` = nội dung nằm TRONG bong bóng có nền
 * (tệp, tin thoại, thẻ link) nên phải trừ thêm padding bong bóng; ảnh/video thì chính nó là bong bóng.
 *
 * KHÔNG tính `screenW * BUBBLE_MAX`: `maxWidth: 74%` ở bong bóng đo theo bề rộng DANH SÁCH (đã trừ
 * padding), lấy theo màn hình là nội dung rộng hơn nền bong bóng → ảnh/thẻ thò ra ngoài mép.
 */
export function useBubbleWidth(inBubble = false) {
  const { width } = useWindowDimensions();
  return Math.max(150, (width - LIST_PAD * 2) * BUBBLE_MAX - (inBubble ? BUBBLE_PAD * 2 : 0));
}

// ─── Chữ (có @nhắc tên + link bấm được) ─────────────────────────────────────

/**
 * KHÔNG để `selectable`: trên Android nhấn giữ sẽ bật thanh Copy/Share/Select all của hệ thống đè lên
 * menu nhấn giữ của app (đã có "Sao chép"). `trailing` = khoảng trống vô hình chừa chỗ cho giờ gửi.
 */
export function TextContent({ content, mine, trailing }: { content: string; mine: boolean; trailing?: string }) {
  const parts = parseContent(content);
  return (
    <Text className={`text-[15px] leading-[21px] ${mine ? 'text-on-brand' : 'text-foreground'}`}>
      {parts.map((p, i) =>
        p.kind === 'text' ? (
          p.text
        ) : p.kind === 'mention' ? (
          <Text key={i} className={`font-semibold ${mine ? 'text-on-brand underline' : 'text-brand'}`}>
            {p.text}
          </Text>
        ) : (
          <Text key={i} className={`underline ${mine ? 'text-on-brand' : 'text-info'}`} onPress={() => Linking.openURL(p.text)}>
            {p.text}
          </Text>
        ),
      )}
      {/* Cùng cỡ chữ với dòng giờ gửi (10.5) để bề rộng chừa ra khớp đúng. KHÔNG dùng 'transparent': Android
          coi màu alpha 0 của chữ lồng là "chưa đặt màu" → lấy màu chữ cha, chuỗi chừa chỗ hiện ra thành giờ lặp. */}
      {trailing ? <Text style={{ color: '#00000001', fontSize: 10.5 }}>{trailing}</Text> : null}
    </Text>
  );
}

/**
 * Lớp phủ "đang tải lên": % + nút Huỷ, như web. Tin đang gửi mà không biết tới đâu là người dùng
 * bấm gửi lại hoặc thoát màn giữa chừng — nhất là video 40MB trên 3G.
 */
function UploadOverlay({ percent, onCancel, radius = 16 }: { percent: number; onCancel?: () => void; radius?: number }) {
  return (
    <View className="absolute inset-0 items-center justify-center gap-2" style={{ borderRadius: radius, backgroundColor: 'rgba(15,23,42,0.45)' }}>
      <View className="items-center">
        <ActivityIndicator color="#ffffff" />
        <Text className="pt-1 text-[11px] font-bold text-white" style={{ fontVariant: ['tabular-nums'] }}>
          {percent}%
        </Text>
      </View>
      {onCancel ? (
        <Pressable onPress={onCancel} hitSlop={8} className="rounded-full bg-white/90 px-2.5 py-1 active:opacity-80">
          <Text className="text-[11px] font-semibold text-navy">Huỷ</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Ảnh / album ────────────────────────────────────────────────────────────

/**
 * Album ảnh. Khung luôn có kích thước cố định theo width/height lưu sẵn trong tin — ảnh tải
 * xong không làm khung nhảy (bài học bên web: chat-video-layout-jitter).
 *
 * Xếp ô GIỐNG WEB: 2–4 ảnh thì 2 cột, từ 5 ảnh thì 3 cột và chỉ hiện tối đa 9 ô, ô cuối đè "+N".
 * Bấm 1 ảnh là mở trình xem vuốt ngang qua CẢ album (trước chỉ xem được đúng ảnh đã bấm).
 */
export function ImageAlbum({ message, onCancelUpload }: { message: ChatMessage; onCancelUpload?: () => void }) {
  const { data: token } = useMediaToken();
  const [viewer, setViewer] = useState<number | null>(null);
  const maxW = Math.min(useBubbleWidth(), 280);
  // Nền chờ: ảnh tải xong mới có pixel, không có nền thì bong bóng là một mảng TRẮNG to đúng cỡ ảnh
  // — nhìn như tin nhắn rỗng. Đặt ngay trong `style` cùng chỗ với borderRadius: trên Android, trộn
  // nền bằng className với borderRadius inline là mất bo góc.
  const ph = useThemeColor('surface-muted');

  const images: (ChatMessageImage & { local?: string })[] = message.local_images?.length
    ? message.local_images.map((local) => ({ local, width: message.width, height: message.height }))
    : message.images?.length
      ? message.images.filter((img) => img.file_url || img.thumbnail_url)
      : [{ file_url: message.file_url, thumbnail_url: message.thumbnail_url, width: message.width, height: message.height }];

  // Xem to: ảnh GỐC. Ô trong bong bóng: bản THU NHỎ đúng cỡ ô (×2 cho màn retina) — xem thumbMediaUrl.
  const fullUris = images.map((img) => img.local ?? resolveMediaUrl(img.file_url, token?.media_token) ?? '');
  const tileUri = (img: (typeof images)[number], px: number) =>
    img.local ?? thumbMediaUrl(img.thumbnail_url || img.file_url, token?.media_token, px * 2);

  const cols = images.length <= 4 ? 2 : 3;
  const maxTiles = cols === 2 ? 4 : 9;
  const shown = images.slice(0, maxTiles);
  const overflow = images.length - shown.length;

  let content;
  if (images.length === 1) {
    const img = images[0];
    const ratio = img.width && img.height ? img.width / img.height : 4 / 3;
    const w = maxW;
    const h = Math.max(120, Math.min(360, w / ratio));
    content = (
      <Pressable onPress={() => setViewer(0)}>
        <Image
          source={{ uri: tileUri(img, w), cacheKey: thumbCacheKey(img.thumbnail_url || img.file_url, w * 2) }}
          style={{ width: w, height: h, borderRadius: 14, backgroundColor: ph }}
          contentFit="cover"
          transition={120}
        />
      </Pressable>
    );
  } else {
    const gap = 3;
    const cell = (maxW - gap * (cols - 1)) / cols;
    content = (
      <View className="flex-row flex-wrap" style={{ width: maxW, gap }}>
        {shown.map((img, i) => (
          <Pressable key={i} onPress={() => setViewer(i)}>
            <Image
              source={{ uri: tileUri(img, cell), cacheKey: thumbCacheKey(img.thumbnail_url || img.file_url, cell * 2) }}
              style={{ width: cell, height: cell, borderRadius: 8, backgroundColor: ph }}
              contentFit="cover"
              transition={120}
            />
            {overflow > 0 && i === shown.length - 1 ? (
              <View className="absolute inset-0 items-center justify-center rounded-lg bg-black/55">
                <Text className="text-[19px] font-bold text-white">+{overflow}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    );
  }

  return (
    <>
      {content}
      {message.pending ? <UploadOverlay percent={message.upload_progress ?? 0} onCancel={onCancelUpload} /> : null}
      <AlbumViewer uris={fullUris} index={viewer} onClose={() => setViewer(null)} />
    </>
  );
}

/**
 * Trình xem ảnh toàn màn hình: vuốt ngang chuyển ảnh (khi có nhiều ảnh), chụm/chạm đúp phóng to,
 * vuốt dọc để đóng. Dùng cho album trong chat và cho mọi màn khác qua `ImageViewer`.
 */
export function AlbumViewer({ uris, index, onClose }: { uris: string[]; index: number | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(index ?? 0);
  const [zoomed, setZoomed] = useState(false);
  // Mở ở ảnh khác → nhảy về đúng ảnh đó (so với lần mở trước, không setState trong effect)
  const [openedAt, setOpenedAt] = useState(index);
  if (index !== openedAt) {
    setOpenedAt(index);
    if (index !== null) setCurrent(index);
  }

  if (index === null) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* Modal trên Android là cây view riêng → phải có GestureHandlerRootView thì cử chỉ mới chạy */}
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
        <FlatList
          data={uris}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed && uris.length > 1}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          keyExtractor={(_, i) => String(i)}
          showsHorizontalScrollIndicator={false}
          windowSize={3}
          onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) =>
            item ? (
              <View style={{ width, height }}>
                <ZoomableImage uri={item} onDismiss={onClose} pager onZoomChange={setZoomed} />
              </View>
            ) : (
              <View style={{ width, height }} />
            )
          }
        />
        <Pressable
          onPress={onClose}
          accessibilityLabel="Đóng"
          className="absolute right-4 h-10 w-10 items-center justify-center rounded-full bg-white/20"
          style={{ top: insets.top + 8 }}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
        {uris.length > 1 ? (
          <Text className="absolute left-5 text-[13px] font-semibold text-white/85" style={{ top: insets.top + 19 }}>
            {current + 1}/{uris.length}
          </Text>
        ) : null}
      </GestureHandlerRootView>
    </Modal>
  );
}

/** Xem 1 ảnh toàn màn hình (chứng chỉ, phản hồi, thông báo lớp, diễn đàn, kho tài liệu…). */
export function ImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return <AlbumViewer uris={uri ? [uri] : []} index={uri ? 0 : null} onClose={onClose} />;
}

/**
 * Nhãn dán: ảnh/GIF thì hiện thẳng. Nhãn Lottie (`application/json`) chỉ app Task dựng được —
 * ở đây hiện ô thay thế, không thì expo-image nhận file JSON rồi để lại một ô trống 140px.
 */
export function StickerContent({ message }: { message: ChatMessage }) {
  const { data: token } = useMediaToken();
  const st = message.sticker;
  const raw = st?.url || (st?.key ? `/api/uploads/file?key=${encodeURIComponent(st.key)}` : null);
  const uri = resolveMediaUrl(raw, token?.media_token);

  if (!uri || st?.mime === 'application/json') {
    return (
      <View className="items-center justify-center rounded-2xl bg-surface-muted" style={{ width: 140, height: 140 }}>
        <Ionicons name="happy-outline" size={26} color="#9ca3af" />
        <Text className="pt-1 text-[11px] text-muted">Nhãn dán</Text>
      </View>
    );
  }
  return <Image source={{ uri }} style={{ width: 140, height: 140 }} contentFit="contain" autoplay />;
}

// ─── Tệp / video / thoại ────────────────────────────────────────────────────

export function FileContent({ message, mine, onCancelUpload }: { message: ChatMessage; mine: boolean; onCancelUpload?: () => void }) {
  const { data: token } = useMediaToken();
  const onBrand = useThemeColor('on-brand');
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const percent = message.upload_progress ?? 0;
  const isVideo = message.message_type === 'video';
  const url = resolveMediaUrl(message.file_url, token?.media_token);
  const size = formatSize(message.file_size);
  const { icon, color } = fileIcon({ mime_type: message.mime_type, file_name: message.file_name });
  const ext = (message.file_name?.split('.').pop() ?? '').slice(0, 4).toUpperCase();
  // Bề rộng PHẢI khoá lại (như tin thoại): bong bóng co theo nội dung, mà trong khung co-theo-nội-dung
  // thì Yoga đo con `flex-1` ra BỀ RỘNG 0 → tên tệp xuống dòng từng ký tự, bong bóng cao nghều mà hẹp rín.
  const w = Math.min(useBubbleWidth(true), 240);
  return (
    <Pressable
      onPress={() => !message.pending && url && Linking.openURL(url)}
      className="flex-row items-center gap-3 active:opacity-70"
      style={{ width: w }}>
      <View
        className="h-11 w-11 items-center justify-center rounded-xl"
        // Tin của mình nằm trên nền đỏ thương hiệu → ô icon dùng trắng mờ, chữ trắng mới đọc được
        style={{ backgroundColor: mine ? 'rgba(255,255,255,0.22)' : `${color}1f` }}>
        <Ionicons name={isVideo ? 'play' : icon} size={20} color={mine ? onBrand : color} />
        {ext && !isVideo ? (
          <Text className="text-[8.5px] font-extrabold" style={{ color: mine ? onBrand : color }}>
            {ext}
          </Text>
        ) : null}
      </View>
      <View className="flex-1">
        <Text className={`text-sm font-semibold ${mine ? 'text-on-brand' : 'text-foreground'}`} numberOfLines={2}>
          {message.file_name || (isVideo ? 'Video' : 'Tệp đính kèm')}
        </Text>
        <Text className={`text-xs ${mine ? 'text-on-brand opacity-80' : 'text-muted'}`} numberOfLines={1}>
          {message.pending ? `Đang tải lên… ${percent}%` : [size, 'Bấm để mở'].filter(Boolean).join(' · ')}
        </Text>
        {message.pending ? (
          <View className="mt-1.5 h-1 overflow-hidden rounded-full" style={{ backgroundColor: mine ? 'rgba(255,255,255,0.3)' : 'rgba(127,127,127,0.25)' }}>
            <View className="h-full rounded-full" style={{ width: `${Math.max(4, percent)}%`, backgroundColor: mine ? onBrand : brand }} />
          </View>
        ) : null}
      </View>
      {message.pending && onCancelUpload ? (
        <Pressable onPress={onCancelUpload} hitSlop={8} accessibilityLabel="Huỷ tải lên" className="h-7 w-7 items-center justify-center rounded-full active:opacity-70">
          <Ionicons name="close" size={15} color={mine ? onBrand : muted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

/**
 * Tin thoại: nút phát + dải sóng (đo lúc ghi) tô màu theo tiến độ + thời lượng — như Messenger.
 * Trình phát chỉ được tạo khi bấm phát lần đầu: tạo sẵn cho mọi tin thoại đang hiện thì mỗi bong
 * bóng giữ 1 player native + tải trước file âm thanh, cuộn phòng nhiều tin thoại sẽ khựng.
 */
export function VoiceContent({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const [active, setActive] = useState(false);
  if (active) return <VoicePlayer message={message} mine={mine} />;
  const total = message.duration || 0;
  return <VoiceView message={message} mine={mine} playing={false} progress={0} remaining={total} onToggle={() => setActive(true)} />;
}

function VoicePlayer({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const { data: token } = useMediaToken();
  const uri = resolveMediaUrl(message.file_url, token?.media_token);
  const player = useAudioPlayer(uri ? { uri } : null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);

  // Vừa được bấm phát → phát luôn (lần bấm đó đã tạo ra player này).
  // iOS: gạt công tắc im lặng thì mặc định KHÔNG ra tiếng — phải bật `playsInSilentMode`, không thì
  // người nghe tưởng tin thoại hỏng (bấm phát, thanh sóng chạy mà im re).
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
    player.play();
  }, [player]);

  const total = status.duration || message.duration || 0;
  const progress = total ? Math.min(1, status.currentTime / total) : 0;
  const remaining = Math.max(0, Math.round(total - (status.playing || status.currentTime ? status.currentTime : 0)));

  const toggle = () => {
    if (status.playing) return player.pause();
    if (total && status.currentTime >= total - 0.05) void player.seekTo(0);
    player.play();
  };

  return <VoiceView message={message} mine={mine} playing={status.playing} progress={progress} remaining={remaining} onToggle={toggle} />;
}

function VoiceView({
  message,
  mine,
  playing,
  progress,
  remaining,
  onToggle,
}: {
  message: ChatMessage;
  mine: boolean;
  playing: boolean;
  progress: number;
  remaining: number;
  onToggle: () => void;
}) {
  const onBrand = useThemeColor('on-brand');
  const brand = useThemeColor('brand');
  const bars = message.waveform?.length ? message.waveform : Array.from({ length: 36 }, (_, i) => 30 + ((i * 37) % 50));
  const shown = bars.length > 40 ? bars.filter((_, i) => i % Math.ceil(bars.length / 40) === 0) : bars;
  // 230 cố định làm tin thoại thò ra ngoài bong bóng trên máy màn hình nhỏ (320dp) → kẹp theo bong bóng
  const w = Math.min(useBubbleWidth(true), 230);

  return (
    <View className="flex-row items-center gap-2.5" style={{ width: w }}>
      <Pressable
        onPress={onToggle}
        accessibilityLabel={playing ? 'Tạm dừng' : 'Phát tin thoại'}
        className={`h-9 w-9 items-center justify-center rounded-full ${mine ? 'bg-white/25' : 'bg-brand'}`}>
        <Ionicons name={playing ? 'pause' : 'play'} size={16} color={onBrand} style={{ marginLeft: playing ? 0 : 2 }} />
      </Pressable>
      <View className="h-7 flex-1 flex-row items-center gap-[2px]">
        {shown.map((v, i) => (
          <View
            key={i}
            className="flex-1 rounded-full"
            style={{
              height: 4 + (Math.max(0, Math.min(100, v)) / 100) * 22,
              backgroundColor:
                i / shown.length <= progress ? (mine ? onBrand : brand) : mine ? 'rgba(255,255,255,0.45)' : 'rgba(127,127,127,0.35)',
            }}
          />
        ))}
      </View>
      <Text className={`text-xs ${mine ? 'text-on-brand' : 'text-muted'}`} style={{ fontVariant: ['tabular-nums'] }}>
        {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
      </Text>
    </View>
  );
}

/**
 * Video: khung tỉ lệ cố định (không giật layout) + nút phát → mở trình phát toàn màn hình.
 * class-be CHƯA sinh ảnh bìa cho video (chỉ ảnh mới có thumbnail) nên phần lớn video sẽ rơi vào
 * nhánh "không có bìa": hiện thẻ tối có tên tệp + thời lượng thay vì một ô đen thui khó hiểu.
 */
export function VideoContent({ message, onCancelUpload }: { message: ChatMessage; onCancelUpload?: () => void }) {
  const { data: token } = useMediaToken();
  const [open, setOpen] = useState(false);
  const w = Math.min(useBubbleWidth(), 260);
  const ratio = message.width && message.height ? message.width / message.height : 16 / 9;
  const h = Math.max(140, Math.min(320, w / ratio));
  const uri = resolveMediaUrl(message.file_url, token?.media_token);
  const thumb = thumbMediaUrl(message.thumbnail_url, token?.media_token, w * 2);
  const dur = message.duration ? `${Math.floor(message.duration / 60)}:${String(Math.round(message.duration % 60)).padStart(2, '0')}` : '';

  return (
    <>
      <Pressable
        onPress={() => !message.pending && uri && setOpen(true)}
        className="overflow-hidden rounded-2xl bg-black"
        style={{ width: w, height: h }}>
        {thumb ? <Image source={{ uri: thumb }} style={{ width: w, height: h }} contentFit="cover" /> : null}
        {message.pending ? null : (
          <View className="absolute inset-0 items-center justify-center gap-2 px-3">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-white/20">
              <Ionicons name="play" size={26} color="#fff" style={{ marginLeft: 3 }} />
            </View>
            {!thumb ? (
              <Text className="text-center text-[12.5px] font-medium text-white/85" numberOfLines={2}>
                {message.file_name || 'Video'}
              </Text>
            ) : null}
          </View>
        )}
        {message.pending ? <UploadOverlay percent={message.upload_progress ?? 0} onCancel={onCancelUpload} /> : null}
        {dur ? (
          // Góc dưới TRÁI — góc dưới phải là chỗ của giờ gửi
          <View className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5">
            <Text className="text-xs font-semibold text-white">{dur}</Text>
          </View>
        ) : null}
      </Pressable>
      {videoCaption(message) ? <Text className="pt-1 text-sm text-foreground">{videoCaption(message)}</Text> : null}
      {open && uri ? <VideoPlayerModal uri={uri} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Chú thích thật của video — bỏ chữ giữ chỗ mà client tự điền khi gửi video không kèm lời ("Video",
 * "[Video]", chính tên tệp), không thì dưới mỗi video lại lơ lửng một chữ "Video".
 */
function videoCaption(m: ChatMessage) {
  const c = m.content?.trim();
  if (!c || c.startsWith('[') || /^video$/i.test(c) || c === m.file_name) return null;
  return c;
}

/** Trình phát video toàn màn hình (dùng cả ở kho media của phòng). */
export function VideoPlayerModal({ uri, onClose }: { uri: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(uri, (p) => {
    p.play();
  });
  // Như tin thoại: iPhone gạt im lặng thì video phát mà không có tiếng
  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
  }, []);
  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View className="flex-1 bg-black">
        <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls fullscreenOptions={{ enable: true }} />
        <Pressable
          onPress={onClose}
          accessibilityLabel="Đóng"
          className="absolute right-4 h-10 w-10 items-center justify-center rounded-full bg-white/20"
          style={{ top: insets.top + 8 }}>
          <Ionicons name="close" size={24} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

// ─── Bình chọn ──────────────────────────────────────────────────────────────
// (thẻ bài tập / nhắc giờ học / thông báo / nhóm hoạt động: xem cards.tsx)

export function PollContent({ message, myId }: { message: ChatMessage; myId?: string }) {
  const sheet = useActionSheet();
  const poll = message.poll!;
  const [busy, setBusy] = useState(false);
  const success = useThemeColor('success');
  const mutedColor = useThemeColor('muted');
  const navy = useThemeColor('navy');
  const { width: screenW } = useWindowDimensions();
  const mine = poll.options.filter((o) => myId && o.voter_ids.includes(myId)).map((o) => o._id);
  const total = Math.max(1, poll.total_voter_count);

  async function vote(optionId: string) {
    if (poll.is_closed || busy || !message.room_id) return;
    const next = poll.allow_multiple
      ? mine.includes(optionId)
        ? mine.filter((id) => id !== optionId)
        : [...mine, optionId]
      : mine.includes(optionId)
        ? []
        : [optionId];
    setBusy(true);
    const res = await emitWithAck('vote_poll', { room_id: message.room_id, message_id: message._id, option_ids: next });
    setBusy(false);
    if (!res.success) showToast('error', 'Chưa bình chọn được', res.error || 'Vui lòng thử lại.');
  }

  return (
    // Cùng khung với các thẻ bot (cards.tsx): viền mảnh, dải đầu icon + nhãn in hoa
    <View className="overflow-hidden rounded-2xl border border-border bg-surface" style={{ width: Math.min(screenW - 40, 400) }}>
      <View className="flex-row items-center gap-2.5 border-b border-border px-4 py-2.5">
        <View className="h-8 w-8 items-center justify-center rounded-lg bg-navy-soft">
          <Ionicons name="stats-chart" size={16} color={navy} />
        </View>
        <View className="flex-1">
          <Text className="text-[11px] font-bold uppercase tracking-wide text-navy">Bình chọn{poll.is_closed ? ' · Đã kết thúc' : ''}</Text>
          <Text className="text-[11.5px] text-muted" numberOfLines={1}>
            {poll.allow_multiple ? 'Chọn nhiều' : 'Chọn một'} · {poll.total_voter_count} người đã bình chọn
            {!poll.is_closed && poll.deadline ? ` · hạn ${formatDateTime(poll.deadline)}` : ''}
          </Text>
        </View>
      </View>
      <View className="gap-2 px-4 py-3">
        <Text className="text-[15px] font-semibold leading-5 text-foreground">{poll.question}</Text>
        {poll.options.map((o) => {
          const picked = mine.includes(o._id);
          const pct = Math.round((o.vote_count / total) * 100);
          return (
            <Pressable
              key={o._id}
              disabled={poll.is_closed || busy}
              onPress={() => vote(o._id)}
              className={`overflow-hidden rounded-xl border ${picked ? 'border-success' : 'border-border'}`}>
              <View className="absolute bottom-0 left-0 top-0 bg-success-soft" style={{ width: `${pct}%` }} />
              <View className="flex-row items-center gap-2 px-3 py-2.5">
                <Ionicons name={picked ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={picked ? success : mutedColor} />
                <Text className="flex-1 text-sm text-foreground">{o.text}</Text>
                <Text className="text-xs font-semibold text-muted">{o.vote_count}</Text>
              </View>
            </Pressable>
          );
        })}
        {poll.allow_add_option && !poll.is_closed ? <AddPollOption message={message} /> : null}
        {/* Người tạo được kết thúc sớm (server cho thêm người có quyền xoá tin) */}
        {!poll.is_closed && message.sender?._id === myId ? (
          <Pressable
            onPress={() =>
              sheet.confirm({
                title: 'Kết thúc bình chọn?',
                message: 'Sau khi kết thúc sẽ không ai bình chọn thêm được.',
                label: 'Kết thúc',
                icon: 'stop-circle-outline',
                onConfirm: async () => {
                  const res = await emitWithAck('close_poll', { room_id: message.room_id, message_id: message._id });
                  if (!res.success) showToast('error', 'Chưa kết thúc được', res.error);
                },
              })
            }
            className="items-center py-1">
            <Text className="text-sm font-medium text-danger">Kết thúc bình chọn</Text>
          </Pressable>
        ) : null}
      </View>
      {sheet.sheet}
    </View>
  );
}

function AddPollOption({ message }: { message: ChatMessage }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');

  async function add() {
    const value = text.trim();
    if (!value || !message.room_id) return;
    setBusy(true);
    const res = await emitWithAck('add_poll_option', { room_id: message.room_id, message_id: message._id, text: value });
    setBusy(false);
    if (!res.success) {
      showToast('error', 'Chưa thêm được', res.error);
      return;
    }
    setText('');
    setOpen(false);
  }

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} className="flex-row items-center gap-2 py-1">
        <Ionicons name="add-circle-outline" size={18} color={brand} />
        <Text className="text-sm font-medium text-brand">Thêm lựa chọn</Text>
      </Pressable>
    );
  }
  return (
    <View className="flex-row items-center gap-2">
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        placeholder="Lựa chọn mới…"
        placeholderTextColor={muted}
        maxLength={150}
        onSubmitEditing={add}
        className="h-10 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-foreground"
      />
      <Pressable onPress={add} disabled={busy} hitSlop={6}>
        <Ionicons name={busy ? 'hourglass-outline' : 'checkmark-circle'} size={26} color={brand} />
      </Pressable>
    </View>
  );
}

/** Thẻ xem trước link (Open Graph) dưới tin chữ: ảnh + tiêu đề + tên trang, bấm mở link. */
export function LinkPreviewCard({ url, mine }: { url: string; mine: boolean }) {
  const { data } = useLinkPreview(url);
  const w = Math.min(useBubbleWidth(true), 260);
  if (!data || (!data.title && !data.image)) return null;
  return (
    <Pressable
      onPress={() => Linking.openURL(data.url || url)}
      className={`overflow-hidden rounded-xl active:opacity-80 ${mine ? 'bg-white/15' : 'bg-surface-muted'}`}
      style={{ width: w }}>
      {data.image ? <Image source={{ uri: data.image }} style={{ width: w, height: w * 0.52 }} contentFit="cover" /> : null}
      <View className="gap-0.5 p-2.5">
        {data.site ? (
          <Text className={`text-xs uppercase ${mine ? 'text-on-brand opacity-80' : 'text-muted'}`} numberOfLines={1}>
            {data.site}
          </Text>
        ) : null}
        {data.title ? (
          <Text className={`text-sm font-semibold ${mine ? 'text-on-brand' : 'text-foreground'}`} numberOfLines={2}>
            {data.title}
          </Text>
        ) : null}
        {data.description ? (
          <Text className={`text-xs ${mine ? 'text-on-brand opacity-85' : 'text-muted'}`} numberOfLines={2}>
            {data.description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Link đầu tiên trong tin (để làm thẻ xem trước). */
export function firstLink(content: string) {
  return parseContent(content).find((p) => p.kind === 'link')?.text ?? null;
}
