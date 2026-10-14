import { Ionicons } from '@expo/vector-icons';
import {
  AudioQuality,
  IOSOutputFormat,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ensureMicPermission } from '@/features/assignments/quiz/speaking-recorder';
import { useThemeColor } from '@/theme/use-theme-color';

/** Tin thoại: AAC .m4a mono — nhẹ (~0.5MB/phút), phát được ở mọi trình duyệt/điện thoại. */
const VOICE_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
  ios: { extension: '.m4a', outputFormat: IOSOutputFormat.MPEG4AAC, audioQuality: AudioQuality.MEDIUM },
  android: { extension: '.m4a', outputFormat: 'mpeg4', audioEncoder: 'aac' },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

const MAX_SECONDS = 5 * 60;
/** Server nhận tối đa 80 cột sóng (0..100) — xem chat.gateway send_message.waveform */
const WAVE_BARS = 60;

export interface VoiceClip {
  uri: string;
  duration: number;
  waveform: number[];
}

/** Gom mẫu âm lượng (dBFS) thành N cột 0..100 để vẽ dải sóng ở bong bóng. */
function toWaveform(levels: number[]): number[] {
  if (!levels.length) return [];
  const bars: number[] = [];
  const step = levels.length / WAVE_BARS;
  for (let i = 0; i < Math.min(WAVE_BARS, levels.length); i++) {
    const slice = levels.slice(Math.floor(i * step), Math.max(Math.floor((i + 1) * step), Math.floor(i * step) + 1));
    const peak = Math.max(...slice);
    bars.push(Math.round(Math.max(0, Math.min(1, (peak + 55) / 55)) * 100));
  }
  return bars;
}

/**
 * Thanh ghi âm tin thoại — thay chỗ ô nhập khi đang ghi (như Messenger): chấm đỏ + thời gian +
 * dải sóng chạy, nút Huỷ và Gửi. Bắt đầu ghi ngay khi mount.
 */
export function VoiceRecorderBar({ onCancel, onSend }: { onCancel: () => void; onSend: (clip: VoiceClip) => void }) {
  const recorder = useAudioRecorder(VOICE_OPTIONS);
  const state = useAudioRecorderState(recorder, 100);
  const levels = useRef<number[]>([]);
  const [recent, setRecent] = useState<number[]>([]);
  const finished = useRef(false);
  const danger = useThemeColor('danger');
  const onBrand = useThemeColor('on-brand');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!(await ensureMicPermission())) {
        onCancel();
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (cancelled) return;
      recorder.record();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    })();
    return () => {
      cancelled = true;
      if (!finished.current) void recorder.stop().catch(() => undefined);
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state.isRecording && state.metering != null) {
      levels.current.push(state.metering);
      setRecent(levels.current.slice(-28));
    }
  }, [state.durationMillis, state.isRecording, state.metering]);

  const seconds = Math.floor((state.durationMillis ?? 0) / 1000);

  const finish = async (send: boolean) => {
    if (finished.current) return;
    finished.current = true;
    await recorder.stop().catch(() => undefined);
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (!send || !recorder.uri || seconds < 1) {
      onCancel();
      return;
    }
    onSend({ uri: recorder.uri, duration: Math.max(1, Math.round((state.durationMillis ?? 0) / 1000)), waveform: toWaveform(levels.current) });
  };

  useEffect(() => {
    if (seconds >= MAX_SECONDS) void finish(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds]);

  return (
    <View className="flex-row items-center gap-2 px-2 py-2">
      <Pressable onPress={() => void finish(false)} className="h-10 w-10 items-center justify-center" accessibilityLabel="Huỷ ghi âm">
        <Ionicons name="trash-outline" size={22} color={danger} />
      </Pressable>
      <View className="h-10 flex-1 flex-row items-center gap-2 rounded-2xl bg-danger-soft px-3">
        <View className="h-2.5 w-2.5 rounded-full bg-danger" />
        <Text className="text-sm font-semibold text-danger" style={{ fontVariant: ['tabular-nums'] }}>
          {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
        </Text>
        <View className="h-6 flex-1 flex-row items-center justify-end gap-[2px] overflow-hidden">
          {recent.map((db, i) => (
            <View key={i} className="w-[3px] rounded-full bg-danger" style={{ height: 4 + Math.max(0, Math.min(1, (db + 55) / 55)) * 20 }} />
          ))}
        </View>
      </View>
      <Pressable
        onPress={() => void finish(true)}
        accessibilityLabel="Gửi tin thoại"
        className="h-10 w-10 items-center justify-center rounded-full bg-brand active:opacity-80">
        <Ionicons name="send" size={18} color={onBrand} />
      </Pressable>
    </View>
  );
}
