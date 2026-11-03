import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, Share, Text, View } from 'react-native';

import { useActionSheet } from '@/components/ui/action-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchBox } from '@/components/ui/list-filters';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { showToast } from '@/components/ui/toast';
import { fold } from '@/features/chat/mentions';
import {
  availableProviders,
  buildSeekUrl,
  formatClock,
  isRunning,
  PROVIDER_LABEL,
  transcriptPercent,
  transcriptPlainText,
  transcriptSrt,
  useRequestTranscript,
  useVideoTranscript,
  type TranscriptProvider,
  type TranscriptSegment,
  type VideoTranscript,
} from '@/features/video-scripts/api';
import { ProgressBar } from '@/features/video-scripts/components';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useStableCallback } from '@/lib/use-stable-callback';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Script 1 video — bản mobile của VideoTranscriptDialog: tiến độ / lỗi / danh sách đoạn có mốc giờ,
 * tìm trong script, sao chép, chia sẻ dạng .txt / .srt (web tải file → app mở bảng chia sẻ), tạo lại.
 * Bấm mốc giờ mở video gốc đúng giây đó (YouTube/Vimeo; Bunny không có link công khai, như web).
 * Không phát video cạnh script: trình phát E-Learning của app là WebView không báo giờ phát về app,
 * nên không tô được đoạn đang nói như VideoTranscriptPlayerDialog của web.
 */
export default function VideoScriptDetailScreen() {
  const params = useLocalSearchParams<{ videoId: string; title?: string; url?: string }>();
  const videoId = params.videoId ?? '';
  const title = params.title || 'Video';
  const videoUrl = params.url || '';
  const brand = useThemeColor('brand');
  const warning = useThemeColor('warning');
  const menu = useActionSheet();

  const query = useVideoTranscript(videoId);
  const pull = usePullRefresh(() => query.refetch());
  const requestMutation = useRequestTranscript(videoId);
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState<TranscriptProvider | ''>('');

  const transcript = query.data?.data ?? null;
  const providers = query.data?.providers;
  const usable = availableProviders(providers);
  const chosenProvider = provider || providers?.default || usable[0] || '';
  const running = isRunning(transcript?.status);

  const segments = useMemo(() => transcript?.segments ?? [], [transcript]);
  const keyword = fold(search.trim());
  const visible = useMemo(() => (keyword ? segments.filter((s) => fold(s.text).includes(keyword)) : segments), [segments, keyword]);

  const request = () =>
    requestMutation.mutate(chosenProvider || undefined, {
      onSuccess: () => showToast('success', 'Đã xếp hàng tạo script', 'Có thể rời màn này, server vẫn chạy tiếp'),
      onError: (err) => showToast('error', 'Chưa tạo được script', getErrorMessage(err)),
    });

  const confirmRegenerate = () =>
    menu.confirm({
      title: transcript?.status === 'failed' ? 'Thử tạo lại script?' : 'Chép lại script từ đầu?',
      message: 'Gọi lại API chép lời (tính phí). Script cũ vẫn xem được tới khi bản mới xong.',
      label: transcript?.status === 'failed' ? 'Thử lại' : 'Tạo lại',
      icon: 'refresh',
      danger: false,
      onConfirm: request,
    });

  const pickProvider = () =>
    menu.show({
      title: 'Nhà cung cấp chép lời',
      actions: usable.map((p) => ({ label: PROVIDER_LABEL[p], selected: p === chosenProvider, onPress: () => setProvider(p) })),
    });

  const copyAll = async () => {
    await Clipboard.setStringAsync(transcriptPlainText(segments));
    showToast('success', 'Đã sao chép script');
  };
  const shareAs = (kind: 'txt' | 'srt') =>
    void Share.share({ title, message: kind === 'srt' ? transcriptSrt(segments) : transcriptPlainText(segments) });

  const openAt = useStableCallback((seg: TranscriptSegment) => {
    const url = buildSeekUrl(videoUrl, seg.start);
    if (url) void Linking.openURL(url);
  });
  const copyOne = useStableCallback(async (seg: TranscriptSegment) => {
    await Clipboard.setStringAsync(seg.text);
    showToast('success', 'Đã sao chép đoạn');
  });
  const seekable = !!buildSeekUrl(videoUrl, 0);

  const providerPicker =
    usable.length > 1 ? (
      <Pressable onPress={pickProvider} className="h-12 flex-row items-center gap-1 rounded-xl bg-surface-muted px-3 active:opacity-80">
        <Text className="text-[14px] font-semibold text-foreground">{chosenProvider ? PROVIDER_LABEL[chosenProvider] : 'Chọn'}</Text>
        <Ionicons name="chevron-down" size={14} color="#9ca3af" />
      </Pressable>
    ) : null;

  const renderTop = () => {
    if (!transcript && !usable.length) {
      return (
        <View className="flex-row gap-2 rounded-2xl bg-warning-soft p-4">
          <Ionicons name="warning-outline" size={18} color={warning} />
          <Text className="shrink text-[14px] text-warning">
            Server chưa cấu hình API chép lời (Gemini hoặc Whisper). Liên hệ kỹ thuật để bật tính năng.
          </Text>
        </View>
      );
    }
    if (!transcript) {
      return (
        <View className="items-center gap-3 rounded-2xl border border-border bg-surface px-5 py-8">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-soft">
            <Ionicons name="sparkles" size={26} color={brand} />
          </View>
          <Text className="text-[16px] font-semibold text-foreground">Video chưa có script</Text>
          <Text className="text-center text-[13px] text-muted">AI sẽ nghe toàn bộ video và chép lại lời thoại kèm mốc thời gian.</Text>
          <View className="flex-row items-center gap-2">
            {providerPicker}
            <Button title="Tạo script" icon="sparkles" loading={requestMutation.isPending} onPress={request} />
          </View>
        </View>
      );
    }
    return (
      <View className="gap-3">
        <InfoCard transcript={transcript} />
        {running ? <ProgressCard transcript={transcript} /> : null}
        {transcript.status === 'failed' ? (
          <View className="gap-1 rounded-2xl bg-danger-soft p-4">
            <Text className="text-[14px] font-semibold text-danger">Tạo script thất bại</Text>
            {transcript.error ? <Text className="text-[12.5px] text-danger">{transcript.error}</Text> : null}
          </View>
        ) : null}
        {!running ? (
          <View className="flex-row items-center gap-2">
            {providerPicker}
            <Button
              title={transcript.status === 'failed' ? 'Thử lại' : 'Tạo lại'}
              icon="refresh"
              variant="secondary"
              loading={requestMutation.isPending}
              disabled={!usable.length}
              onPress={confirmRegenerate}
              className="flex-1"
            />
          </View>
        ) : null}
        {running && segments.length ? <Text className="text-[12.5px] text-muted">Đang hiện script cũ trong lúc tạo bản mới.</Text> : null}
        {transcript.status === 'done' && !segments.length ? (
          <Text className="py-4 text-center text-[13px] text-muted">AI không nghe thấy lời nói nào trong video.</Text>
        ) : null}
        {segments.length ? (
          <>
            <SearchBox value={search} onChange={setSearch} placeholder="Tìm trong script…" />
            <View className="flex-row flex-wrap items-center gap-2">
              <ActionChip icon="copy-outline" label="Sao chép" onPress={copyAll} />
              <ActionChip icon="share-outline" label="Chia sẻ .txt" onPress={() => shareAs('txt')} />
              <ActionChip icon="share-outline" label="Chia sẻ .srt" onPress={() => shareAs('srt')} />
              <View className="flex-1" />
              <Text className="text-[12px] text-muted">{keyword ? `${visible.length}/${segments.length}` : segments.length} đoạn</Text>
            </View>
            <Text className="text-[11.5px] text-muted">
              {seekable ? 'Bấm mốc giờ để mở video tại đó · ' : ''}Nhấn giữ một đoạn để sao chép
            </Text>
          </>
        ) : null}
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Script video' }} />
      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được script"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : (
        <FlashList
          data={visible}
          keyExtractor={(s, i) => `${s.start}-${i}`}
          renderItem={({ item }) => <SegmentRow seg={item} seekable={seekable} onOpen={openAt} onCopy={copyOne} />}
          ListHeaderComponent={
            <View className="gap-3 pb-3">
              <Text className="text-[17px] font-bold text-foreground">{title}</Text>
              {renderTop()}
            </View>
          }
          ListEmptyComponent={
            keyword && segments.length ? <Text className="py-6 text-center text-[13px] text-muted">Không có đoạn nào khớp</Text> : null
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
        />
      )}
      {menu.sheet}
    </View>
  );
}

function InfoCard({ transcript }: { transcript: VideoTranscript }) {
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      <Badge label={PROVIDER_LABEL[transcript.provider] ?? transcript.provider} tone="info" />
      {transcript.model ? <Text className="text-[12px] text-muted">{transcript.model}</Text> : null}
      {transcript.duration_seconds ? <Text className="text-[12px] text-muted">· {formatClock(transcript.duration_seconds)}</Text> : null}
      {transcript.status === 'done' ? (
        <Text className="text-[12px] text-muted">· {formatDateTime(transcript.finished_at || transcript.updatedAt)}</Text>
      ) : null}
    </View>
  );
}

function ProgressCard({ transcript }: { transcript: VideoTranscript }) {
  const label =
    transcript.status === 'queued'
      ? 'Đang chờ tới lượt…'
      : transcript.stage === 'transcribe'
        ? `Đang chép lời ${transcript.chunks_done}/${transcript.chunks_total} đoạn (mỗi đoạn 5 phút)`
        : 'Đang tải âm thanh video về server…';
  return (
    <View className="gap-2.5 rounded-2xl border border-border bg-surface p-4">
      <Text className="text-[14px] font-semibold text-foreground">{label}</Text>
      <ProgressBar percent={transcript.stage === 'transcribe' ? transcriptPercent(transcript) : 3} />
      <Text className="text-[12px] text-muted">Video 1 tiếng thường mất vài phút. Có thể rời màn này, server vẫn chạy tiếp.</Text>
    </View>
  );
}

function ActionChip({ icon, label, onPress }: { icon: 'copy-outline' | 'share-outline'; label: string; onPress: () => void }) {
  const brand = useThemeColor('brand');
  return (
    <Pressable onPress={onPress} className="h-8 flex-row items-center gap-1 rounded-full bg-brand-soft px-3 active:opacity-80">
      <Ionicons name={icon} size={14} color={brand} />
      <Text className="text-[13px] font-semibold text-brand">{label}</Text>
    </Pressable>
  );
}

const SegmentRow = memo(function SegmentRow({
  seg,
  seekable,
  onOpen,
  onCopy,
}: {
  seg: TranscriptSegment;
  seekable: boolean;
  onOpen: (seg: TranscriptSegment) => void;
  onCopy: (seg: TranscriptSegment) => void;
}) {
  return (
    <Pressable onLongPress={() => onCopy(seg)} className="flex-row gap-3 border-b border-border py-2.5 active:opacity-70">
      <Pressable onPress={() => onOpen(seg)} disabled={!seekable} hitSlop={6} style={{ width: 56 }}>
        <Text className={`pt-0.5 font-mono text-[12px] ${seekable ? 'text-brand' : 'text-muted'}`}>{formatClock(seg.start)}</Text>
      </Pressable>
      <Text className="shrink text-[14.5px] leading-[22px] text-foreground">{seg.text}</Text>
    </Pressable>
  );
});
