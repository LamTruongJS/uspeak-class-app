import { Ionicons } from '@expo/vector-icons';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { AudioPlayer } from '@/components/ui/audio-player';
import { useThemeColor } from '@/theme/use-theme-color';

import type { SpeakingState } from './use-quiz-session';
import { SpeakingFeedback } from './speaking-feedback';

/** Trần độ dài 1 bản thu — giống web: dài quá vừa vượt giới hạn upload vừa khó chấm. */
const MAX_SECONDS = 120;

/**
 * iOS ghi thẳng WAV PCM16 mono 16kHz (đúng định dạng Azure chấm, server khỏi chuyển).
 * Android KHÔNG ghi được WAV → ghi AAC .m4a, class-be tự chuyển sang WAV (audio-transcode.util).
 */
export const SPEAKING_RECORDING: RecordingOptions = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  isMeteringEnabled: true,
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    sampleRate: 44100,
  },
  // Bản web chỉ để xem thử giao diện (expo start --web); app thật không dùng.
  web: { mimeType: 'audio/webm', bitsPerSecond: 128000 },
};

/** Xin quyền micro; bị từ chối thì chỉ đường vào Cài đặt. */
export async function ensureMicPermission(): Promise<boolean> {
  const res = await requestRecordingPermissionsAsync();
  if (res.granted) return true;
  // Hàm thường (không phải component) nên không dùng được bảng chọn — toast có nút là vừa đủ.
  showToast('warning', 'Chưa có quyền micro', 'Bài có câu luyện nói nên cần micro. Bật Micro cho Uspeak Class rồi quay lại.', {
    duration: 6000,
    action: { label: 'Mở Cài đặt', onPress: () => void Linking.openSettings() },
  });
  return false;
}

interface Props {
  state?: SpeakingState;
  /** Bản thu đã lưu từ nháp trước (mở lại bài) */
  savedUrl?: string;
  disabled?: boolean;
  /** Chỉ 1 câu được ghi cùng lúc */
  busyElsewhere?: boolean;
  onRecordingChange?: (recording: boolean) => void;
  onRecorded: (uri: string) => void;
}

export function SpeakingRecorder({ state, savedUrl, disabled, busyElsewhere, onRecordingChange, onRecorded }: Props) {
  const recorder = useAudioRecorder(SPEAKING_RECORDING);
  const rec = useAudioRecorderState(recorder, 150);
  const onBrand = useThemeColor('on-brand');
  const danger = useThemeColor('danger');
  const [starting, setStarting] = useState(false);
  const stoppingRef = useRef(false);

  const seconds = Math.floor((rec.durationMillis ?? 0) / 1000);
  // metering: dBFS (-160 → 0). Quy ra 0..1 cho thanh mức âm.
  const level = rec.metering != null ? Math.max(0, Math.min(1, (rec.metering + 60) / 60)) : 0;

  async function start() {
    if (disabled || busyElsewhere) return;
    setStarting(true);
    try {
      if (!(await ensureMicPermission())) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      onRecordingChange?.(true);
    } catch (err) {
      showToast('error', 'Không mở được micro', err instanceof Error ? err.message : 'Vui lòng thử lại.');
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    try {
      await recorder.stop();
      // Trả audio session về chế độ phát: iOS để allowsRecording=true sẽ phát ra loa trong (rất nhỏ).
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      onRecordingChange?.(false);
      if (recorder.uri) onRecorded(recorder.uri);
    } finally {
      stoppingRef.current = false;
    }
  }

  // Tự dừng khi chạm trần thời lượng
  useEffect(() => {
    if (rec.isRecording && seconds >= MAX_SECONDS) void stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec.isRecording, seconds]);

  const playbackUri = state?.localUri || savedUrl;

  return (
    <View className="gap-3">
      {rec.isRecording ? (
        <View className="items-center gap-3 rounded-2xl bg-danger-soft p-4">
          <View className="flex-row items-center gap-2">
            <View className="h-2.5 w-2.5 rounded-full bg-danger" />
            <Text className="text-base font-semibold text-danger" style={{ fontVariant: ['tabular-nums'] }}>
              Đang ghi âm {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} / 2:00
            </Text>
          </View>
          <View className="h-2 w-full overflow-hidden rounded-full bg-surface">
            <View className="h-full rounded-full bg-danger" style={{ width: `${Math.round(level * 100)}%` }} />
          </View>
          <Pressable
            onPress={stop}
            accessibilityLabel="Dừng ghi âm"
            className="h-16 w-16 items-center justify-center rounded-full bg-danger active:opacity-80">
            <Ionicons name="stop" size={26} color={onBrand} />
          </Pressable>
          <Text className="text-xs text-muted">Bấm để dừng và lưu bản thu</Text>
        </View>
      ) : (
        <View className="items-center gap-2 py-2">
          <Pressable
            onPress={start}
            disabled={disabled || busyElsewhere || starting}
            accessibilityLabel={playbackUri ? 'Thu lại' : 'Bắt đầu ghi âm'}
            className={`h-16 w-16 items-center justify-center rounded-full bg-brand active:opacity-80 ${disabled || busyElsewhere ? 'opacity-40' : ''}`}>
            {starting ? <ActivityIndicator color={onBrand} /> : <Ionicons name="mic" size={28} color={onBrand} />}
          </Pressable>
          <Text className="text-sm text-muted">{playbackUri ? 'Bấm để thu lại' : 'Bấm để bắt đầu nói'}</Text>
        </View>
      )}

      {playbackUri && !rec.isRecording ? <AudioPlayer key={playbackUri} uri={playbackUri} label="Bản thu của bạn" /> : null}

      {state?.uploading ? (
        <View className="flex-row items-center gap-2">
          <ActivityIndicator size="small" />
          <Text className="text-sm text-muted">Đang lưu và chấm bản thu…</Text>
        </View>
      ) : null}
      {state?.failed ? (
        <View className="flex-row items-center gap-2">
          <Ionicons name="warning" size={16} color={danger} />
          <Text className="flex-1 text-sm text-danger">Bản thu chưa lưu được. Vui lòng thu lại câu này.</Text>
        </View>
      ) : null}
      {state?.assessment ? <SpeakingFeedback result={state.assessment} /> : null}
    </View>
  );
}
