import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/ui/youtube-player';
import { WEB_URL } from '@/config/env';
import { bunnyVideoIdFromKey, getSubmissionVideoPlayback, isBunnyVideoKey } from '@/lib/submission-video';

/**
 * Trình phát video bài nộp cho màn chấm / kết quả — nhận "khoá video" (YouTube ID hoặc `bunny:<guid>`,
 * xem lib/submission-video.ts) và trả về CÙNG giao diện `YoutubePlayerHandle` (seekTo/play/pause +
 * onTime/onState), để logic nhận xét theo mốc / lặp đoạn (segment-loop.ts) không phải biết nguồn video.
 * Bản app của `lib/submission-video-player.ts` bên class-fe.
 */
export type SubmissionPlayerHandle = YoutubePlayerHandle;

interface PlayerProps {
  /** YouTube ID hoặc `bunny:<guid>` */
  videoKey: string;
  /** Giây bắt đầu */
  start?: number;
  onTime?: (seconds: number) => void;
  /** 1 = đang phát, 2 = tạm dừng, 0 = hết (mã của YT.PlayerState) */
  onState?: (state: number) => void;
}

export const SubmissionVideoPlayer = forwardRef<SubmissionPlayerHandle, PlayerProps>(function SubmissionVideoPlayer(
  { videoKey, ...rest },
  ref,
) {
  return isBunnyVideoKey(videoKey) ? (
    <BunnySubmissionPlayer ref={ref} guid={bunnyVideoIdFromKey(videoKey)} {...rest} />
  ) : (
    <YoutubePlayer ref={ref} videoId={videoKey} {...rest} />
  );
});

// ─── Bunny ───────────────────────────────────────────────────────────────

/** Video đang nén: hỏi lại mỗi 15s, tối đa ~20 phút rồi thôi (giống web) — còn nút "Kiểm tra lại". */
const PROCESSING_POLL_MS = 15_000;
const PROCESSING_MAX_POLLS = 80;
const PLAYERJS_SRC = 'https://assets.mediadelivery.net/playerjs/player-0.1.0.min.js';

/**
 * Khung nhúng Bunny + Player.js trong WebView. Player.js phải nạp TRƯỚC khi tạo iframe (nó chỉ bắt được
 * sự kiện `ready` của iframe khi script đã chạy) → script đồng bộ ở <head>, iframe tạo bằng JS sau đó.
 * Lệnh trước khi player sẵn sàng (seek/play) được Player.js tự xếp hàng.
 * `baseUrl` = WEB_URL để iframe có Referer class.uspeak.vn như bản web.
 */
const bunnyHtml = (playUrl: string, start: number) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style>
<script src="${PLAYERJS_SRC}"></script>
</head><body>
<script>
var p = null, last = -1, startAt = ${Math.max(0, Math.floor(start))};
function send(o){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
function time(t){ if (typeof t === 'number' && Math.abs(t - last) >= 0.2) { last = t; send({ type: 'time', t: t }); } }
var f = document.createElement('iframe');
f.src = ${JSON.stringify(playUrl).replace(/</g, '\\u003c')};
f.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen';
f.setAttribute('allowfullscreen', '');
document.body.appendChild(f);
if (window.playerjs && window.playerjs.Player) {
  p = new playerjs.Player(f);
  p.on('ready', function(){ send({ type: 'ready' }); if (startAt > 0) p.setCurrentTime(startAt); });
  p.on('timeupdate', function(d){ if (d) time(d.seconds); });
  p.on('play', function(){ send({ type: 'state', state: 1 }); });
  p.on('pause', function(){ send({ type: 'state', state: 2 }); });
  p.on('ended', function(){ send({ type: 'state', state: 0 }); });
}
window.__cmd = function(c){
  if (!p) return;
  try {
    if (c.type === 'seek') { p.setCurrentTime(c.t); last = -1; time(c.t); if (c.play) p.play(); }
    if (c.type === 'play') p.play();
    if (c.type === 'pause') p.pause();
  } catch (e) {}
};
</script></body></html>`;

const BunnySubmissionPlayer = forwardRef<SubmissionPlayerHandle, Omit<PlayerProps, 'videoKey'> & { guid: string }>(
  function BunnySubmissionPlayer({ guid, start = 0, onTime, onState }, ref) {
    const web = useRef<WebView>(null);
    const query = useQuery({
      queryKey: ['submission-video-play', guid],
      queryFn: () => getSubmissionVideoPlayback(guid),
      // Link có token: đừng tự xin lại khi đang xem (link mới = WebView nạp lại, mất chỗ đang phát)
      staleTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      refetchInterval: (q) => {
        const d = q.state.data;
        const processing = !!d && !d.play_url && d.status !== 'failed' && d.status !== 'deleted';
        return processing && q.state.dataUpdateCount < PROCESSING_MAX_POLLS ? PROCESSING_POLL_MS : false;
      },
      retry: (count, err) => !(isAxiosError(err) && err.response?.status === 404) && count < 2,
    });
    const playUrl = query.data?.play_url ?? null;
    // Giữ `start` lúc mở — đổi prop sau đó không nạp lại video
    const [startAt] = useState(start);
    const html = useMemo(() => (playUrl ? bunnyHtml(playUrl, startAt) : null), [playUrl, startAt]);

    const run = (cmd: object) => web.current?.injectJavaScript(`window.__cmd && window.__cmd(${JSON.stringify(cmd)}); true;`);
    useImperativeHandle(ref, () => ({
      seekTo: (t, play = true) => run({ type: 'seek', t: Math.max(0, t), play }),
      play: () => run({ type: 'play' }),
      pause: () => run({ type: 'pause' }),
    }));

    const onMessage = (e: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(e.nativeEvent.data) as { type: string; t?: number; state?: number };
        if (msg.type === 'time' && typeof msg.t === 'number') onTime?.(msg.t);
        if (msg.type === 'state' && typeof msg.state === 'number') onState?.(msg.state);
      } catch {
        // bỏ qua tin không phải JSON
      }
    };

    let notice: React.ReactNode = null;
    if (!html) {
      const d = query.data;
      if (query.isPending) {
        notice = <Notice busy title="Đang tải video…" />;
      } else if (query.isError) {
        const notFound = isAxiosError(query.error) && query.error.response?.status === 404;
        notice = notFound ? (
          <Notice icon="eye-off-outline" title="Không xem được video" detail="Video không tồn tại hoặc bạn không có quyền xem." />
        ) : (
          <Notice icon="cloud-offline-outline" title="Không tải được video" onRetry={() => void query.refetch()} />
        );
      } else if (d?.status === 'deleted') {
        notice = <Notice icon="trash-outline" title="Video đã bị xoá" detail="Video đã hết hạn lưu trữ hoặc đã bị xoá khỏi hệ thống." />;
      } else if (d?.status === 'failed') {
        notice = (
          <Notice icon="alert-circle-outline" title="Video bị lỗi khi xử lý" detail="Video này không xem được — cần tải lại video khác." />
        );
      } else {
        notice = (
          <Notice
            busy
            title="Video đang được xử lý…"
            detail="Video vừa được tải lên, hệ thống đang nén. Video sẽ tự hiện khi xong (thường vài phút)."
            onRetry={query.isFetching ? undefined : () => void query.refetch()}
            retryLabel="Kiểm tra lại"
          />
        );
      }
    }

    return (
      <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }}>
        {html ? (
          <WebView
            key={playUrl}
            ref={web}
            source={{ html, baseUrl: WEB_URL }}
            originWhitelist={['*']}
            onMessage={onMessage}
            style={{ flex: 1, backgroundColor: '#000' }}
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            scrollEnabled={false}
            setSupportMultipleWindows={false}
          />
        ) : (
          notice
        )}
      </View>
    );
  },
);

/** Thông báo trong khung đen 16:9 (chữ sáng cố định — nền luôn đen dù app sáng hay tối). */
function Notice({
  title,
  detail,
  busy,
  icon,
  onRetry,
  retryLabel = 'Thử lại',
}: {
  title: string;
  detail?: string;
  busy?: boolean;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-1.5 px-5">
      {busy ? <ActivityIndicator color="#e2e8f0" /> : icon ? <Ionicons name={icon} size={26} color="#e2e8f0" /> : null}
      <Text className="text-center text-[14px] font-bold" style={{ color: '#e2e8f0' }}>
        {title}
      </Text>
      {detail ? (
        <Text className="text-center text-[12px] leading-[17px]" style={{ color: '#94a3b8' }}>
          {detail}
        </Text>
      ) : null}
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          hitSlop={8}
          className="mt-1 rounded-full px-3.5 py-1.5 active:opacity-70"
          style={{ backgroundColor: '#ffffff22' }}
        >
          <Text className="text-[12.5px] font-semibold text-white">{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
