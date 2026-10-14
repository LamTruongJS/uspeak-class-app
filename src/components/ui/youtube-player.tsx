import { forwardRef, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { WEB_URL } from '@/config/env';

/**
 * Trình phát YouTube NGAY TRONG APP (không bật app YouTube / trình duyệt) — dùng YouTube IFrame API
 * trong WebView, giống web dùng YT.Player:
 * - báo giây đang phát về app (`onTime`, ~4 lần/giây) → ghi mốc nhận xét;
 * - app điều khiển được: `seekTo(giây)`, `play()`, `pause()` → bấm mốc nhận xét là tua tới đúng chỗ.
 *
 * `baseUrl` phải là 1 domain thật: nạp HTML trần (about:blank) thì YouTube chặn phát (lỗi 152/153
 * vì thiếu Referer).
 */
export interface YoutubePlayerHandle {
  seekTo: (seconds: number, play?: boolean) => void;
  play: () => void;
  pause: () => void;
}

const html = (videoId: string, start: number) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;padding:0;background:#000;height:100%;overflow:hidden}#p{position:absolute;inset:0;width:100%;height:100%}</style>
</head><body><div id="p"></div>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
var player, last = -1;
function send(o){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
function onYouTubeIframeAPIReady(){
  player = new YT.Player('p', {
    videoId: ${JSON.stringify(videoId)},
    playerVars: { playsinline: 1, rel: 0, modestbranding: 1, start: ${Math.floor(start)} },
    events: {
      onReady: function(){ send({ type: 'ready', duration: player.getDuration() }); },
      onStateChange: function(e){ send({ type: 'state', state: e.data }); }
    }
  });
  setInterval(function(){
    if (player && player.getCurrentTime) {
      var t = player.getCurrentTime();
      if (Math.abs(t - last) >= 0.2) { last = t; send({ type: 'time', t: t }); }
    }
  }, 250);
}
window.__cmd = function(c){
  if (!player) return;
  if (c.type === 'seek') { player.seekTo(c.t, true); if (c.play) player.playVideo(); }
  if (c.type === 'play') player.playVideo();
  if (c.type === 'pause') player.pauseVideo();
};
</script></body></html>`;

export const YoutubePlayer = forwardRef<
  YoutubePlayerHandle,
  {
    videoId: string;
    /** Giây bắt đầu (mở từ mốc nhận xét) */
    start?: number;
    onTime?: (seconds: number) => void;
    /** 1 = đang phát, 2 = tạm dừng, 0 = hết (mã của YT.PlayerState) */
    onState?: (state: number) => void;
  }
>(function YoutubePlayer({ videoId, start = 0, onTime, onState }, ref) {
  const web = useRef<WebView>(null);
  const run = (cmd: object) => web.current?.injectJavaScript(`window.__cmd(${JSON.stringify(cmd)}); true;`);

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

  return (
    <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }}>
      <WebView
        // Đổi video → dựng lại player từ đầu (giống web destroy/new YT.Player)
        key={videoId}
        ref={web}
        source={{ html: html(videoId, start), baseUrl: WEB_URL }}
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
    </View>
  );
});
