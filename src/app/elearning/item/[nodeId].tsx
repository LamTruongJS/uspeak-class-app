import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';

import { showToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { HtmlView } from '@/components/ui/html-view';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { WEB_URL } from '@/config/env';
import {
  fetchAttachmentUrl,
  NODE_LABEL,
  nodeTitle,
  studyTime,
  useBunnyEmbed,
  useMarkProgress,
  useStudentTree,
  videoSource,
  type ElearningAttachment,
  type LessonContent,
  type LessonVideo,
  type PracticeLesson,
} from '@/features/elearning/api';
import { getErrorMessage } from '@/lib/api/client';
import { useThemeColor } from '@/theme/use-theme-color';

/** Cứ 30 giây gửi một nhịp thời gian học (BE chặn tối đa 600 giây mỗi nhịp). */
const HEARTBEAT_SECONDS = 30;

/**
 * Một mục E-Learning: video bài giảng, bài đọc, hoặc bài luyện tập.
 * Video nhúng (Bunny/YouTube/Vimeo) phát bằng WebView đúng như khung nhúng bên web; video là file
 * mp4/m3u8 thì phát bằng trình phát native cho mượt.
 */
export default function ElearningItemScreen() {
  const { nodeId, classId } = useLocalSearchParams<{ nodeId: string; classId: string }>();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');

  const tree = useStudentTree(classId);
  const node = useMemo(() => (tree.data ?? []).find((n) => n._id === nodeId), [tree.data, nodeId]);
  const mark = useMarkProgress(classId);

  const contentType = node?.type === 'video' ? 'video' : node?.type === 'practice' ? 'practice' : 'lesson_content';
  const contentId = node?.ref_id || '';

  // ── Đếm thời gian học thật ──
  // Khung nhúng không báo trạng thái đang phát về app được, nên tính theo thời gian MỞ màn này
  // lúc app đang chạy (vào nền là dừng đếm) — xem ghi chú ở docs/HANDOFF.md.
  const seconds = useRef(0);
  useEffect(() => {
    if (!classId || !contentId) return;
    let active = AppState.currentState === 'active';

    const flush = () => {
      const value = seconds.current;
      seconds.current = 0;
      if (value < 5) return;
      if (contentType === 'video') void studyTime.video(classId, contentId, value);
      else void studyTime.activity(classId, contentType, contentId, value);
    };

    const tick = setInterval(() => {
      if (!active) return;
      seconds.current += 1;
      if (seconds.current >= HEARTBEAT_SECONDS) flush();
    }, 1000);

    const sub = AppState.addEventListener('change', (state) => {
      active = state === 'active';
      if (!active) flush();
    });

    return () => {
      clearInterval(tick);
      sub.remove();
      flush();
    };
  }, [classId, contentId, contentType]);

  async function toggleDone() {
    if (!node?.ref_id) return;
    try {
      await mark.mutateAsync({
        content_type: contentType,
        content_id: node.ref_id,
        is_completed: !node.is_completed,
      });
    } catch (err) {
      showToast('error', 'Không lưu được tiến độ', getErrorMessage(err));
    }
  }

  if (tree.isLoading) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: 'Nội dung' }} />
        <LoadingView />
      </View>
    );
  }

  if (!node || !node.ref_data) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: 'Nội dung' }} />
        <StateView
          icon="alert-circle-outline"
          title="Không tìm thấy nội dung"
          description="Nội dung này có thể đã bị gỡ khỏi lớp."
          actionLabel="Tải lại"
          onAction={() => tree.refetch()}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: nodeTitle(node) }} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-10">
        <View className="flex-row items-center gap-2">
          <Badge label={NODE_LABEL[node.type] ?? 'Nội dung'} tone="brand" />
          {node.is_completed ? <Badge label="Đã học xong" tone="success" /> : null}
        </View>

        <Text className="text-[19px] font-bold leading-7 text-foreground">{nodeTitle(node)}</Text>

        {node.type === 'video' ? <VideoBlock classId={classId} video={node.ref_data as LessonVideo} /> : null}
        {node.type === 'lesson_content' ? <LessonBlock content={node.ref_data as LessonContent} /> : null}
        {node.type === 'practice' ? <PracticeBlock classId={classId} lesson={node.ref_data as PracticeLesson} /> : null}

        <Button
          title={node.is_completed ? 'Bỏ đánh dấu đã học' : 'Đánh dấu đã học xong'}
          icon={node.is_completed ? 'refresh' : 'checkmark-circle'}
          variant={node.is_completed ? 'secondary' : 'primary'}
          loading={mark.isPending}
          onPress={toggleDone}
        />

        <Text className="text-center text-[11px] text-muted">
          <Ionicons name="time-outline" size={11} color={muted} /> Thời gian học của bạn được ghi nhận khi màn này đang mở.
        </Text>

        {tree.isFetching ? <ActivityIndicator color={brand} /> : null}
      </ScrollView>
    </View>
  );
}

// ─── Video ──────────────────────────────────────────────────────────────────

function VideoBlock({ classId, video }: { classId: string; video: LessonVideo }) {
  const { width } = useWindowDimensions();
  const source = useMemo(() => videoSource(video), [video]);
  const bunny = useBunnyEmbed(classId, video._id, source.kind === 'bunny');
  const height = Math.round(((width - 32) * 9) / 16);

  const embedUri = source.kind === 'bunny' ? bunny.data?.url : source.kind === 'embed' ? source.uri : undefined;

  return (
    <View className="gap-3">
      {source.kind === 'file' ? (
        <FilePlayer uri={source.uri} height={height} />
      ) : embedUri ? (
        <View className="overflow-hidden rounded-2xl bg-black" style={{ height }}>
          <WebView
            source={{ uri: embedUri }}
            style={{ flex: 1, backgroundColor: '#000' }}
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            javaScriptEnabled
            domStorageEnabled
          />
        </View>
      ) : source.kind === 'bunny' && bunny.isLoading ? (
        <View className="items-center justify-center rounded-2xl bg-surface-muted" style={{ height }}>
          <ActivityIndicator />
        </View>
      ) : (
        <View className="items-center justify-center gap-2 rounded-2xl bg-surface-muted" style={{ height }}>
          <Ionicons name="videocam-off-outline" size={26} color="#9ca3af" />
          <Text className="text-[13px] text-muted">Video này chưa phát được trên app</Text>
          {video.video_url ? (
            <Pressable onPress={() => void WebBrowser.openBrowserAsync(video.video_url)} className="active:opacity-70">
              <Text className="text-[13px] font-semibold text-brand">Mở bằng trình duyệt</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {video.description ? <HtmlView html={video.description} /> : null}
      <Attachments items={video.attachments} />
    </View>
  );
}

function FilePlayer({ uri, height }: { uri: string; height: number }) {
  const player = useVideoPlayer(uri);
  return (
    <View className="overflow-hidden rounded-2xl bg-black" style={{ height }}>
      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls fullscreenOptions={{ enable: true }} />
    </View>
  );
}

// ─── Bài đọc ────────────────────────────────────────────────────────────────

function LessonBlock({ content }: { content: LessonContent }) {
  return (
    <View className="gap-3">
      <HtmlView html={content.content_html} />
      <Attachments items={content.attachments} />
    </View>
  );
}

// ─── Luyện tập ──────────────────────────────────────────────────────────────

interface PracticeSection {
  header?: string;
  header_color?: string;
  content_type?: string;
  content_html?: string;
  sort_order?: number;
  items?: { en?: string; ipa?: string; vi?: string; audio_url?: string }[];
}

/**
 * Luyện tập: app vẽ được phần CHỮ (các khối rich text và danh sách từ/câu của gói luyện âm).
 * Phần tương tác (ghi âm chấm phát âm, trò chơi của Everyday English / TVST / Active Talk) vẫn
 * mở bản web — xem mục 5 của docs/HANDOFF.md.
 */
function PracticeBlock({ classId, lesson }: { classId: string; lesson: PracticeLesson }) {
  const content = lesson.content as { sections?: PracticeSection[]; theory_html?: string } | undefined;
  const sections = useMemo(
    () => [...(content?.sections ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [content?.sections],
  );
  const hasText = !!content?.theory_html || sections.some((s) => s.content_html || s.items?.length);

  return (
    <View className="gap-3">
      {content?.theory_html ? <HtmlView html={content.theory_html} /> : null}

      {sections.map((section, index) => (
        <View key={`${section.header ?? 'section'}-${index}`} className="gap-2">
          {section.header ? (
            <View className="flex-row items-center gap-2">
              <View className="h-5 w-1 rounded-full" style={{ backgroundColor: section.header_color || '#dc2626' }} />
              <Text className="flex-1 text-sm font-bold text-foreground">{section.header}</Text>
            </View>
          ) : null}

          {section.content_html ? <HtmlView html={section.content_html} /> : null}

          {section.items?.length ? (
            <View className="gap-2">
              {section.items.map((item, i) => (
                <View key={`${item.en ?? i}`} className="gap-0.5 rounded-xl border border-border bg-surface p-3">
                  {item.en ? <Text className="text-[15px] font-semibold text-foreground">{item.en}</Text> : null}
                  {item.ipa ? <Text className="text-[13px] text-brand">{item.ipa}</Text> : null}
                  {item.vi ? <Text className="text-[13px] text-muted">{item.vi}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}

      {!hasText ? (
        <Text className="text-[13px] text-muted">Bài luyện tập này cần thao tác (nghe – nói – trò chơi) nên mở trên bản web.</Text>
      ) : null}

      <Pressable
        onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/my-classes/${classId}?tab=elearning`)}
        className="h-11 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface active:bg-surface-muted">
        <Ionicons name="open-outline" size={17} color="#6b7280" />
        <Text className="text-sm font-semibold text-foreground">Luyện tập đầy đủ trên web</Text>
      </Pressable>
    </View>
  );
}

// ─── Đính kèm ───────────────────────────────────────────────────────────────

function Attachments({ items }: { items?: ElearningAttachment[] }) {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const [opening, setOpening] = useState<string | null>(null);

  if (!items?.length) return null;

  async function open(att: ElearningAttachment) {
    setOpening(att.s3_key);
    try {
      const url = await fetchAttachmentUrl(att.s3_key);
      await Linking.openURL(url);
    } catch (err) {
      showToast('error', 'Không mở được tệp', getErrorMessage(err));
    } finally {
      setOpening(null);
    }
  }

  return (
    <View className="gap-2">
      <Text className="text-xs font-semibold uppercase tracking-wide text-muted">Tài liệu đính kèm · {items.length}</Text>
      {items.map((att) => (
        <Pressable
          key={att.s3_key}
          onPress={() => open(att)}
          className="flex-row items-center gap-2.5 rounded-xl border border-border bg-surface p-3 active:bg-surface-muted">
          <Ionicons name="document-attach-outline" size={18} color={brand} />
          <Text className="flex-1 text-[13px] font-semibold text-foreground" numberOfLines={1}>
            {att.original_name}
          </Text>
          {opening === att.s3_key ? <ActivityIndicator size="small" color={brand} /> : <Ionicons name="open-outline" size={15} color={muted} />}
        </Pressable>
      ))}
    </View>
  );
}
