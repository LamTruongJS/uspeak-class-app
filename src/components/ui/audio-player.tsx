import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pressable, Text, View } from 'react-native';

import { useThemeColor } from '@/theme/use-theme-color';

function mmss(seconds: number) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface AudioPlayerProps {
  uri?: string | null;
  label?: string;
}

/**
 * Thanh phát audio gọn: nút play/pause + tiến độ + thời gian. Dùng cho đề nghe, câu mẫu, bản thu.
 * Đổi file (vd thu lại) thì truyền `key` mới để tạo player mới.
 */
export function AudioPlayer({ uri, label }: AudioPlayerProps) {
  const player = useAudioPlayer(uri ? { uri } : null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const brand = useThemeColor('brand');
  const onBrand = useThemeColor('on-brand');

  if (!uri) return null;

  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;
  const ended = status.duration > 0 && status.currentTime >= status.duration - 0.05;

  const toggle = () => {
    if (status.playing) {
      player.pause();
      return;
    }
    if (ended) void player.seekTo(0);
    player.play();
  };

  return (
    <View className="flex-row items-center gap-3 rounded-xl bg-surface-muted p-2.5">
      <Pressable
        onPress={toggle}
        accessibilityLabel={status.playing ? 'Tạm dừng' : 'Phát'}
        className="h-10 w-10 items-center justify-center rounded-full bg-brand active:opacity-80">
        <Ionicons name={status.playing ? 'pause' : 'play'} size={18} color={onBrand} style={{ marginLeft: status.playing ? 0 : 2 }} />
      </Pressable>
      <View className="flex-1 gap-1.5">
        {label ? <Text className="text-xs font-medium text-muted">{label}</Text> : null}
        <View className="h-1.5 overflow-hidden rounded-full bg-border">
          <View className="h-full rounded-full bg-brand" style={{ width: `${progress * 100}%` }} />
        </View>
      </View>
      <Text className="w-20 text-right text-xs text-muted" style={{ fontVariant: ['tabular-nums'] }}>
        {status.isLoaded ? `${mmss(status.currentTime)} / ${mmss(status.duration)}` : '…'}
      </Text>
      {status.isBuffering ? <Ionicons name="hourglass-outline" size={14} color={brand} /> : null}
    </View>
  );
}
