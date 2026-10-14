import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router, Stack, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/ui/avatar';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { RichText } from '@/components/ui/rich-text';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/ui/youtube-player';
import {
  gradingActions,
  useGraders,
  useSubmissionForGrading,
  type GradePayload,
  type GradingComment,
  type GradingCriterion,
  type SubmissionForGrading,
} from './grading-api';
import { mmss, rangeLabel, useSegmentPlayback } from './segment-loop';
import { ScoreSlider } from './score-slider';
import { useMyPermissionCodes } from '@/features/chat/api';
import { ImageViewer } from '@/features/chat/message-content';
import { getErrorMessage } from '@/lib/api/client';
import { queryClient } from '@/lib/query-client';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { extractYoutubeVideoId } from '@/lib/youtube';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

/** Đồng hồ đếm ngược giờ chấm: luôn 2 chữ số phút ("05:23") cho khỏi nhảy chiều rộng. */
const clock = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/**
 * Màn chấm/nhận xét bài dùng chung 3 chế độ (route mỏng: app/grading/[id] · regrade/[id] · review/[id]).
 * Luật port từ uspeak-class-fe — sửa luật thì sửa cả hai bên:
 *
 * ▸ mode 'grade' — assignments/grading/[id]/page.tsx:
 * - Chỉ chấm khi bài đang `claimed` (đã "Nhận bài" ở hàng chờ). Nhịp heartbeat 30 giây; đồng hồ
 *   `claimed_at + grading_duration_minutes` (mặc định 30) hết giờ → trả bài + thoát. Rời màn → hỏi rồi trả bài.
 * - Điểm từng tiêu chí bước 0,5; điểm tổng = TRUNG BÌNH các tiêu chí (thang 10).
 * - Nộp được khi: có nhận xét chung · mọi tiêu chí > 0 · bài video có ≥1 nhận xét theo mốc · mỗi ảnh cần
 *   chấm có ≥1 nhận xét · bài video phải có tiêu chí (thiếu tiêu chí = khoá nộp, giống web).
 * - Payload POST /grade giống hệt web: { totalScore, criteria, timestampComments, generalFeedback }.
 *   Thêm so với web: tự lưu nháp vào máy (app có thể bị hệ điều hành tắt giữa chừng).
 * ▸ mode 'regrade' — assignments/regrades/[id]/page.tsx: bài `regrade_requested`, nạp sẵn nhận xét cũ, KHÔNG
 *   giữ bài/đồng hồ; nộp POST /grade kèm `is_regrade: true`.
 * ▸ mode 'review' — assignments/reviews/[id]/page.tsx: bài `waiting_review`, nạp sẵn nhận xét của người chấm,
 *   thêm ô "Góp ý cho người chấm"; Phê duyệt = POST /review. Thao tác khác: Y/c nhận xét lại (request-regrade,
 *   tick ghi lỗi nếu có quyền GRADING_ERROR_RECORD), Chuyển người nhận xét + Tự nhận xét (quyền RETURN_TO_GRADING;
 *   Tự nhận xét ẩn khi bài đứng tên chính mình). Review KHÔNG chặn khi thiếu tiêu chí (web cũng không).
 */
export type GradingMode = 'grade' | 'regrade' | 'review';

const MODE: Record<GradingMode, { title: string; status: string; gone: string }> = {
  grade: {
    title: 'Nhận xét bài',
    status: 'claimed',
    gone: 'Bài đã được trả về hàng chờ, đã có người khác nhận hoặc đã chấm xong. Hãy nhận lại bài ở hàng chờ nếu cần.',
  },
  regrade: {
    title: 'Nhận xét lại',
    status: 'regrade_requested',
    gone: 'Bài không còn ở trạng thái chờ nhận xét lại (đã nhận xét lại xong hoặc đã đổi người).',
  },
  review: {
    title: 'Review nhận xét',
    status: 'waiting_review',
    gone: 'Bài không còn chờ review (đã được duyệt, trả lại hoặc chuyển người khác).',
  },
};

type Media =
  | { kind: 'video'; key: string; label: string; youtubeId: string; itemKey?: string }
  | { kind: 'image'; key: string; label: string; url: string; itemKey?: string };

type Tab = 'grade' | 'brief' | 'notes';

const isImageComment = (c: GradingComment) => c.kind === 'image' || (!!c.itemKey && !c.videoId);
const draftKey = (id: string) => `uspeak.gradingDraft.${id}`;

/** Gom media cần chấm: bài nhiều mục → theo gradable_items (giữ nhãn mục); bài thường → video_urls + image_urls. */
function buildMedia(s: SubmissionForGrading): { media: Media[]; multi: boolean } {
  const multi = s.submission_type === 'multi_task';
  if (multi) {
    const media = (s.gradable_items ?? []).flatMap((g): Media[] => {
      if (g.type === 'youtube_video') {
        const urls = (g.video_urls ?? []).filter(Boolean);
        return urls
          .map((url, i) => {
            const id = extractYoutubeVideoId(url);
            return id
              ? ({
                  kind: 'video',
                  key: `${g.item_key}-v${i}`,
                  label: urls.length > 1 ? `${g.label} (${i + 1})` : g.label,
                  youtubeId: id,
                  itemKey: g.item_key,
                } as Media)
              : null;
          })
          .filter((m): m is Media => !!m);
      }
      const imgs = (g.image_urls ?? []).filter(Boolean);
      return imgs.map((url, i) => ({
        kind: 'image' as const,
        key: `${g.item_key}-i${i}`,
        label: imgs.length > 1 ? `${g.label} (${i + 1})` : g.label,
        url,
        itemKey: imgs.length > 1 ? `${g.item_key}#${i}` : g.item_key,
      }));
    });
    return { media, multi };
  }
  const videos = (s.video_urls?.length ? s.video_urls : s.video_url ? [s.video_url] : [])
    .map((u) => extractYoutubeVideoId(u))
    .filter((v): v is string => !!v);
  const images = (s.image_urls ?? []).filter(Boolean);
  return {
    multi,
    media: [
      ...videos.map((id, i) => ({
        kind: 'video' as const,
        key: `v${i}`,
        label: videos.length > 1 ? `Video ${i + 1}` : 'Video',
        youtubeId: id,
      })),
      // Bài thường: nhận xét ảnh không gắn itemKey riêng (web cũng chỉ bắt buộc ở bài nhiều mục)
      ...images.map((url, i) => ({ kind: 'image' as const, key: `i${i}`, label: images.length > 1 ? `Ảnh ${i + 1}` : 'Ảnh', url })),
    ],
  };
}

export function GradingWorkbench({ id, mode }: { id: string; mode: GradingMode }) {
  const q = useSubmissionForGrading(id);
  const s = q.data;

  if (q.isLoading)
    return (
      <Frame title={MODE[mode].title}>
        <LoadingView />
      </Frame>
    );
  if (q.isError || !s) {
    return (
      <Frame title={MODE[mode].title}>
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được bài nộp"
          description={getErrorMessage(q.error)}
          actionLabel="Thử lại"
          onAction={() => q.refetch()}
        />
      </Frame>
    );
  }
  if (s.status !== MODE[mode].status) {
    return (
      <Frame title={MODE[mode].title}>
        <StateView
          icon="lock-closed-outline"
          title="Bài không còn ở bước này"
          description={MODE[mode].gone}
          actionLabel="Quay lại"
          onAction={() => router.back()}
        />
      </Frame>
    );
  }
  return <GradingForm s={s} mode={mode} />;
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title }} />
      {children}
    </View>
  );
}

function GradingForm({ s, mode }: { s: SubmissionForGrading; mode: GradingMode }) {
  const id = s._id;
  const isGrade = mode === 'grade';
  const myId = useAuthStore((st) => st.user?._id);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const muted = useThemeColor('muted');
  const { data: token } = useMediaToken();
  const perms = useMyPermissionCodes();
  const canRedo = mode !== 'review' && !!perms.data?.includes('SUBMISSION_REDO_REQUEST');
  const canReturn = mode === 'review' && !!perms.data?.includes('RETURN_TO_GRADING');
  const canRecordError = !!perms.data?.includes('GRADING_ERROR_RECORD');
  const canTakeover = canReturn && !!s.feedback?.teacher_id && s.feedback.teacher_id !== myId;

  const { media, multi } = useMemo(() => buildMedia(s), [s]);
  const [active, setActive] = useState(0);
  const current = media[active];
  const imageOnly = media.length > 0 && media.every((m) => m.kind === 'image');

  const [tab, setTab] = useState<Tab>('grade');
  // Nhận xét lại / Review: nạp sẵn nhận xét hiện hành (điểm khớp theo TÊN tiêu chí như web)
  const prior = isGrade ? null : s.feedback;
  const [criteria, setCriteria] = useState<GradingCriterion[]>(() =>
    (s.grading_criteria ?? []).map((c) => ({
      name: c.name,
      maxScore: c.max_score,
      score: prior?.criteria_scores?.find((x) => x.name === c.name)?.score ?? 0,
      description: c.description || '',
    })),
  );
  const [comments, setComments] = useState<GradingComment[]>(() => prior?.timestamp_comments ?? []);
  const [feedback, setFeedback] = useState(() => prior?.text_feedback ?? '');
  const [graderFeedback, setGraderFeedback] = useState(() => (mode === 'review' ? (s.grader_feedback?.content ?? '') : ''));
  const [sheet, setSheet] = useState<null | 'regrade' | 'return' | 'takeover' | 'more'>(null);
  const [submitting, setSubmitting] = useState(false);
  const [redoOpen, setRedoOpen] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);

  // ── Nháp trên máy: nạp 1 lần, lưu mỗi khi đổi ──
  const [draftLoaded, setDraftLoaded] = useState(false);
  useEffect(() => {
    if (!isGrade) return;
    AsyncStorage.getItem(draftKey(id))
      .then((raw) => {
        if (!raw) return;
        const d = JSON.parse(raw) as { criteria?: GradingCriterion[]; comments?: GradingComment[]; feedback?: string };
        if (d.criteria?.length === criteria.length) setCriteria(d.criteria);
        if (d.comments) setComments(d.comments);
        if (d.feedback) setFeedback(d.feedback);
      })
      .catch(() => undefined)
      .finally(() => setDraftLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (!draftLoaded) return;
    const t = setTimeout(
      () => void AsyncStorage.setItem(draftKey(id), JSON.stringify({ criteria, comments, feedback })).catch(() => undefined),
      500,
    );
    return () => clearTimeout(t);
  }, [draftLoaded, id, criteria, comments, feedback]);

  // ── Giữ bài: heartbeat 30 giây + gửi ngay khi app quay lại ──
  useEffect(() => {
    if (!isGrade) return;
    void gradingActions.heartbeat(id);
    const t = setInterval(() => void gradingActions.heartbeat(id), 30_000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void gradingActions.heartbeat(id));
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [id, isGrade]);

  // ── Rời màn: hỏi rồi trả bài về hàng chờ (trừ khi vừa nộp xong / hết giờ) ──
  const leaving = useRef(false);
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (leaving.current) return;
      e.preventDefault();
      Alert.alert(
        'Rời khỏi bài này?',
        isGrade ? 'Bài sẽ được trả về hàng chờ. Phần bạn đã chấm vẫn được lưu nháp trên máy.' : 'Những gì bạn vừa sửa sẽ không được lưu.',
        [
          { text: 'Ở lại', style: 'cancel' },
          {
            text: 'Rời khỏi',
            style: 'destructive',
            onPress: async () => {
              leaving.current = true;
              if (isGrade) await gradingActions.release(id).catch(() => undefined);
              void queryClient.invalidateQueries({ queryKey: ['grading'] });
              navigation.dispatch(e.data.action);
            },
          },
        ],
      );
    });
    return unsub;
  }, [navigation, id, isGrade]);

  // ── Đồng hồ giữ bài ──
  const deadline = isGrade && s.claimed_at ? new Date(s.claimed_at).getTime() + (s.grading_duration_minutes || 30) * 60_000 : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const remaining = deadline ? Math.max(0, Math.floor((deadline - now) / 1000)) : null;
  const expired = remaining === 0;
  useEffect(() => {
    if (!expired || leaving.current) return;
    leaving.current = true;
    void gradingActions.release(id).catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: ['grading'] });
    Alert.alert('Hết thời gian nhận xét', 'Bài đã được trả về hàng chờ. Phần bạn đã chấm vẫn lưu nháp trên máy.', [
      { text: 'Về hàng chờ', onPress: () => router.back() },
    ]);
  }, [expired, id]);

  // ── Điểm ──
  const total = criteria.length ? Math.round((criteria.reduce((a, c) => a + c.score, 0) / criteria.length) * 10) / 10 : 0;
  const videoComments = comments.filter((c) => !isImageComment(c));
  const imageComments = comments.filter(isImageComment);
  const gradableImageKeys = multi ? media.filter((m) => m.kind === 'image' && m.itemKey).map((m) => m.itemKey!) : [];
  const everyImageCommented = gradableImageKeys.every((k) => imageComments.some((c) => c.itemKey === k));
  // Review không chặn thiếu tiêu chí (web reviews/[id] cũng không)
  const missingCriteria = mode !== 'review' && !imageOnly && criteria.length === 0;

  const problems = [
    missingCriteria ? 'Bài tập chưa có tiêu chí chấm điểm — nhờ người tạo bài bổ sung' : null,
    !imageOnly && videoComments.length === 0 ? 'Thêm ít nhất 1 nhận xét theo thời điểm' : null,
    !everyImageCommented ? 'Nhận xét cho tất cả ảnh cần chấm' : null,
    criteria.some((c) => c.score === 0) ? 'Chấm điểm đủ các tiêu chí' : null,
    !feedback.trim() ? 'Viết nhận xét chung' : null,
  ].filter((p): p is string => !!p);

  const payload = (): GradePayload => ({ totalScore: total, criteria, timestampComments: comments, generalFeedback: feedback });

  /** Xong việc (nộp / duyệt / chuyển…) → bỏ chặn rời màn, dọn nháp, làm mới các hàng chờ rồi quay lại. */
  const finish = async (title: string, body: string) => {
    leaving.current = true;
    await AsyncStorage.removeItem(draftKey(id)).catch(() => undefined);
    void queryClient.invalidateQueries({ queryKey: ['grading'] });
    void queryClient.invalidateQueries({ queryKey: ['assignments'] });
    Alert.alert(title, body, [{ text: 'Quay lại', onPress: () => router.back() }]);
  };

  async function submit() {
    setSubmitting(true);
    try {
      if (mode === 'review') {
        await gradingActions.review(id, { ...payload(), graderFeedback });
        await finish('Đã phê duyệt', `Kết quả ${total}/10 của ${s.student_name} đã được gửi cho học viên.`);
      } else {
        await gradingActions.submit(id, { ...payload(), ...(mode === 'regrade' ? { is_regrade: true } : {}) });
        await finish(mode === 'regrade' ? 'Đã nhận xét lại' : 'Đã nộp nhận xét', `Điểm ${total}/10 · ${s.student_name}`);
      }
    } catch (err) {
      Alert.alert(mode === 'review' ? 'Chưa phê duyệt được' : 'Nộp nhận xét chưa được', getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const confirmSubmit = () =>
    Alert.alert(
      mode === 'review' ? 'Phê duyệt kết quả?' : mode === 'regrade' ? 'Nộp nhận xét lại?' : 'Nộp nhận xét?',
      `Điểm tổng ${total}/10 cho ${s.student_name}. ${mode === 'review' ? 'Học viên sẽ thấy kết quả ngay sau khi duyệt.' : 'Sau khi nộp học viên sẽ thấy ngay.'}`,
      [
        { text: 'Xem lại', style: 'cancel' },
        { text: mode === 'review' ? 'Phê duyệt' : 'Nộp', onPress: () => void submit() },
      ],
    );

  const notesCount = [s.status_before_claim === 'reassigned' && s.reassign_reason, s.redo_reason, s.regrade_reason].filter(Boolean).length;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: MODE[mode].title,
          headerRight: () =>
            remaining !== null ? (
              <View
                className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${remaining < 300 ? 'bg-danger-soft' : 'bg-surface-muted'}`}>
                <Ionicons name="timer-outline" size={14} color={remaining < 300 ? '#dc2626' : muted} />
                <Text
                  className={`text-[13px] font-bold ${remaining < 300 ? 'text-danger' : 'text-foreground'}`}
                  style={{ fontVariant: ['tabular-nums'] }}>
                  {clock(remaining)}
                </Text>
              </View>
            ) : null,
        }}
      />
      <KeyboardAvoider>
        {/* ── Media đang chấm (cố định trên cùng, không cuộn theo) ── */}
        {current?.kind === 'video' ? (
          <VideoPane key={current.key} media={current} comments={comments} setComments={setComments} />
        ) : current?.kind === 'image' ? (
          <Pressable onPress={() => setViewer(current.url)} className="bg-black">
            <Image
              source={{ uri: resolveMediaUrl(current.url, token?.media_token) ?? current.url }}
              style={{ width: '100%', aspectRatio: 16 / 10 }}
              contentFit="contain"
            />
            <View className="absolute bottom-2 right-2 flex-row items-center gap-1 rounded-full bg-black/55 px-2.5 py-1">
              <Ionicons name="expand" size={12} color="#fff" />
              <Text className="text-[11px] font-semibold text-white">Phóng to</Text>
            </View>
          </Pressable>
        ) : null}

        {media.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="max-h-14 grow-0 border-b border-border bg-surface"
            contentContainerClassName="items-center gap-2 px-3 py-2">
            {media.map((m, i) => {
              const done =
                m.kind === 'image'
                  ? !m.itemKey || imageComments.some((c) => c.itemKey === m.itemKey)
                  : comments.some((c) => c.videoId === m.youtubeId);
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setActive(i)}
                  className={`h-9 flex-row items-center gap-1.5 rounded-full px-3 ${i === active ? 'bg-foreground' : 'bg-surface-muted'}`}>
                  <Ionicons name={m.kind === 'video' ? 'videocam' : 'image'} size={13} color={i === active ? '#fff' : muted} />
                  <Text className={`text-[13px] font-semibold ${i === active ? 'text-background' : 'text-muted'}`} numberOfLines={1}>
                    {m.label}
                  </Text>
                  {done ? <Ionicons name="checkmark-circle" size={13} color="#059669" /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 p-4"
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled">
          {/* Người nộp */}
          <View className="flex-row items-center gap-3">
            <Avatar name={s.student_name} uri={resolveMediaUrl(s.student_avatar, token?.media_token)} size={42} />
            <View className="flex-1">
              <Text className="text-[15.5px] font-bold text-foreground" numberOfLines={1}>
                {s.student_name}
              </Text>
              <Text className="text-[12.5px] text-muted" numberOfLines={1}>
                {s.class_code} · {s.assignment_title}
              </Text>
            </View>
            {s.attempt_number > 1 ? <Pill text={`Lần ${s.attempt_number}`} tone="violet" /> : null}
            {s.is_late ? <Pill text="Nộp trễ" tone="warning" /> : null}
          </View>

          {prior ? <PriorGraderCard prior={prior} mode={mode} /> : null}

          <View className="flex-row rounded-full bg-surface-muted p-1">
            {(
              [
                ['grade', mode === 'review' ? 'Duyệt' : 'Chấm điểm'],
                ['brief', 'Đề bài'],
                ['notes', notesCount ? `Ghi chú (${notesCount})` : 'Ghi chú'],
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <Pressable
                key={k}
                onPress={() => setTab(k)}
                className={`h-9 flex-1 items-center justify-center rounded-full ${tab === k ? 'bg-surface' : ''}`}>
                <Text className={`text-[13.5px] font-semibold ${tab === k ? 'text-foreground' : 'text-muted'}`}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {tab === 'brief' ? (
            <View className="gap-4">
              <Section title="Yêu cầu nhận xét" icon="clipboard-outline">
                {s.assignment_review_requirement ? (
                  <RichText html={s.assignment_review_requirement} />
                ) : (
                  <Text className="text-[13.5px] text-muted">Không có yêu cầu nhận xét.</Text>
                )}
              </Section>
              <Section title="Đề bài" icon="document-text-outline">
                {s.assignment_description ? (
                  <RichText html={s.assignment_description} />
                ) : (
                  <Text className="text-[13.5px] text-muted">Không có mô tả cho bài tập này.</Text>
                )}
              </Section>
            </View>
          ) : tab === 'notes' ? (
            <NotesTab s={s} />
          ) : (
            <View className="gap-4">
              {current?.kind === 'image' ? (
                <ImageComments media={current} comments={comments} setComments={setComments} required={!!current.itemKey} />
              ) : null}

              {current?.kind === 'video' ? (
                <VideoCommentList comments={comments.filter((c) => c.videoId === current.youtubeId)} setComments={setComments} />
              ) : null}

              <Section title="Chấm điểm theo tiêu chí" icon="star-outline">
                {criteria.length === 0 ? (
                  <Text className="text-[13.5px] text-danger">
                    {imageOnly
                      ? 'Bài không có tiêu chí — chỉ cần nhận xét.'
                      : 'Bài tập chưa có tiêu chí chấm điểm nên chưa nộp nhận xét được.'}
                  </Text>
                ) : (
                  criteria.map((c, i) => (
                    <View key={c.name} className="gap-1.5">
                      <Text className="text-[14px] font-semibold text-foreground">{c.name}</Text>
                      {c.description ? <Text className="text-[12px] text-muted">{c.description}</Text> : null}
                      <ScoreSlider
                        value={c.score}
                        max={c.maxScore}
                        onChange={(v) => setCriteria((prev) => prev.map((x, k) => (k === i ? { ...x, score: v } : x)))}
                      />
                    </View>
                  ))
                )}
                {criteria.length ? (
                  <View className="flex-row items-center justify-between rounded-2xl bg-brand-soft px-4 py-3">
                    <Text className="text-[13.5px] font-semibold text-brand">Điểm tổng (trung bình)</Text>
                    <Text className="text-[22px] font-extrabold text-brand">
                      {total || '—'}
                      <Text className="text-[13px] font-semibold"> / 10</Text>
                    </Text>
                  </View>
                ) : null}
              </Section>

              <Section title="Nhận xét chung" icon="chatbox-ellipses-outline">
                <TextInput
                  value={feedback}
                  onChangeText={setFeedback}
                  multiline
                  placeholder="Nhận xét tổng quát cho học viên: điểm mạnh, cần cải thiện, yêu cầu luyện thêm…"
                  placeholderTextColor={muted}
                  textAlignVertical="top"
                  className="min-h-32 rounded-2xl bg-surface-muted p-3.5 text-[15px] leading-5 text-foreground"
                />
              </Section>

              {mode === 'review' ? (
                <Section title="Góp ý cho người chấm" icon="megaphone-outline">
                  <Text className="text-[12.5px] text-muted">Chỉ người nhận xét đọc được — góp ý cách nhận xét / chấm điểm.</Text>
                  <TextInput
                    value={graderFeedback}
                    onChangeText={setGraderFeedback}
                    multiline
                    placeholder="VD: Cần góp ý cụ thể hơn ở tiêu chí pronunciation, dẫn chứng rõ phút giây…"
                    placeholderTextColor={muted}
                    textAlignVertical="top"
                    className="min-h-24 rounded-2xl bg-warning-soft p-3.5 text-[15px] leading-5 text-foreground"
                  />
                </Section>
              ) : null}
            </View>
          )}
        </ScrollView>

        {/* ── Thanh dưới ── */}
        <View className="gap-2 border-t border-border bg-surface px-4 pt-2.5" style={{ paddingBottom: insets.bottom + 10 }}>
          {problems.length ? (
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="information-circle" size={15} color={muted} />
              <Text className="flex-1 text-[12.5px] text-muted" numberOfLines={1}>
                Còn thiếu: {problems[0]}
                {problems.length > 1 ? ` (+${problems.length - 1})` : ''}
              </Text>
            </View>
          ) : null}
          <View className="flex-row gap-2.5">
            {mode === 'review' ? (
              <Pressable
                onPress={() => setSheet('more')}
                className="h-12 flex-row items-center justify-center gap-1.5 rounded-2xl bg-surface-muted px-4 active:opacity-70">
                <Ionicons name="ellipsis-horizontal-circle-outline" size={18} color={muted} />
                <Text className="text-[14px] font-semibold text-foreground">Khác</Text>
              </Pressable>
            ) : null}
            {canRedo ? (
              <Pressable
                onPress={() => setRedoOpen(true)}
                className="h-12 flex-row items-center justify-center gap-1.5 rounded-2xl bg-surface-muted px-4 active:opacity-70">
                <Ionicons name="refresh" size={17} color={muted} />
                <Text className="text-[14px] font-semibold text-foreground">Làm lại</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={confirmSubmit}
              disabled={!!problems.length || submitting}
              className={`h-12 flex-1 flex-row items-center justify-center gap-2 rounded-2xl ${problems.length ? 'bg-surface-muted' : 'bg-brand active:opacity-85'}`}>
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name={mode === 'review' ? 'checkmark-circle' : 'send'} size={16} color={problems.length ? muted : '#fff'} />
              )}
              <Text className={`text-[15px] font-bold ${problems.length ? 'text-muted' : 'text-white'}`}>
                {mode === 'review' ? 'Phê duyệt' : mode === 'regrade' ? 'Nộp nhận xét lại' : 'Nộp nhận xét'}
                {total ? ` · ${total}` : ''}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoider>

      <ImageViewer uri={viewer ? (resolveMediaUrl(viewer, token?.media_token) ?? viewer) : null} onClose={() => setViewer(null)} />
      <RedoSheet
        open={redoOpen}
        studentName={s.student_name}
        attempt={s.attempt_number}
        onClose={() => setRedoOpen(false)}
        onDone={async () => {
          leaving.current = true;
          await AsyncStorage.removeItem(draftKey(id)).catch(() => undefined);
          void queryClient.invalidateQueries({ queryKey: ['grading'] });
          router.back();
        }}
        submissionId={id}
      />
      {mode === 'review' ? (
        <ReviewSheets
          s={s}
          sheet={sheet}
          setSheet={setSheet}
          canReturn={canReturn}
          canTakeover={canTakeover}
          canRecordError={canRecordError}
          gradeReady={!problems.length}
          buildPayload={payload}
          onDone={finish}
        />
      ) : null}
    </View>
  );
}

/** Nhận xét hiện hành của người chấm (Nhận xét lại / Review) — điểm cũ + số lỗi đã ghi nhận. */
function PriorGraderCard({ prior, mode }: { prior: NonNullable<SubmissionForGrading['feedback']>; mode: GradingMode }) {
  const errors = prior.teacher_error_count ?? 0;
  return (
    <View className="gap-1 rounded-2xl bg-surface p-3.5">
      <View className="flex-row items-center gap-2">
        <Ionicons name="person-circle-outline" size={18} color="#6b7280" />
        <Text className="flex-1 text-[13.5px] text-foreground" numberOfLines={1}>
          {mode === 'review' ? 'Người nhận xét: ' : 'Nhận xét trước: '}
          <Text className="font-bold">{prior.teacher_name ?? '—'}</Text>
        </Text>
        {typeof prior.score === 'number' ? <Text className="text-[13.5px] font-extrabold text-brand">{prior.score}/10</Text> : null}
      </View>
      {errors > 0 ? <Text className="text-[12px] font-semibold text-danger">Đã ghi nhận {errors} lỗi nhận xét của người này</Text> : null}
      <Text className="text-[12px] text-muted">
        {mode === 'review'
          ? 'Nội dung bên dưới là nhận xét của họ — sửa nếu cần rồi Phê duyệt.'
          : 'Đã nạp sẵn nhận xét cũ — sửa phần cần chấm lại rồi nộp.'}
      </Text>
    </View>
  );
}

type SheetKind = null | 'regrade' | 'return' | 'takeover' | 'more';

/** Các thao tác phụ của Review: menu "Khác" + 3 bảng nhập lý do. */
function ReviewSheets({
  s,
  sheet,
  setSheet,
  canReturn,
  canTakeover,
  canRecordError,
  gradeReady,
  buildPayload,
  onDone,
}: {
  s: SubmissionForGrading;
  sheet: SheetKind;
  setSheet: (v: SheetKind) => void;
  canReturn: boolean;
  canTakeover: boolean;
  canRecordError: boolean;
  gradeReady: boolean;
  buildPayload: () => GradePayload;
  onDone: (title: string, body: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const fg = useThemeColor('foreground');
  const grader = s.feedback?.teacher_name ?? 'người nhận xét';
  const items: {
    key: Exclude<SheetKind, null | 'more'>;
    icon: ComponentProps<typeof Ionicons>['name'];
    label: string;
    sub: string;
    show: boolean;
  }[] = [
    { key: 'regrade', icon: 'refresh-circle-outline', label: 'Yêu cầu nhận xét lại', sub: `Trả bài về ${grader} kèm lý do`, show: true },
    {
      key: 'return',
      icon: 'swap-horizontal',
      label: 'Chuyển người nhận xét',
      sub: 'Giao cho người khác chấm, ghi lỗi người cũ',
      show: canReturn,
    },
    { key: 'takeover', icon: 'create-outline', label: 'Tự nhận xét bài này', sub: 'Bài đứng tên bạn, ghi lỗi người cũ', show: canTakeover },
  ];
  return (
    <>
      <Modal visible={sheet === 'more'} transparent animationType="fade" onRequestClose={() => setSheet(null)} statusBarTranslucent>
        <View className="flex-1 justify-end bg-black/45">
          <Pressable className="absolute inset-0" onPress={() => setSheet(null)} />
          <View className="gap-1 rounded-t-3xl bg-surface px-3 pt-2.5" style={{ paddingBottom: insets.bottom + 12 }}>
            <View className="mb-2 h-1 w-10 self-center rounded-full bg-border" />
            {items
              .filter((i) => i.show)
              .map((i) => (
                <Pressable
                  key={i.key}
                  onPress={() => {
                    if (i.key === 'takeover' && !gradeReady) {
                      setSheet(null);
                      Alert.alert(
                        'Chưa đủ để tự nhận xét',
                        'Hoàn tất nhận xét (đủ điểm, nhận xét chung, mốc video…) rồi mới ghi nhận bài về mình.',
                      );
                      return;
                    }
                    setSheet(i.key);
                  }}
                  className="flex-row items-center gap-3.5 rounded-xl px-3 py-3 active:bg-surface-muted">
                  <Ionicons name={i.icon} size={22} color={fg} />
                  <View className="flex-1">
                    <Text className="text-[15px] font-semibold text-foreground">{i.label}</Text>
                    <Text className="text-[12.5px] text-muted">{i.sub}</Text>
                  </View>
                </Pressable>
              ))}
          </View>
        </View>
      </Modal>

      <ReasonSheet
        open={sheet === 'regrade'}
        title="Yêu cầu nhận xét lại"
        hint={`Bài quay về ${grader} ngay, điểm mới sẽ thay điểm cũ.`}
        fields={[
          { key: 'reason', placeholder: 'Phần nào cần nhận xét lại và vì sao (VD: điểm pronunciation thấp không hợp lý ở phút 1:30…)' },
        ]}
        checkbox={canRecordError && s.feedback?.teacher_name ? `Ghi nhận lỗi nhận xét của ${s.feedback.teacher_name}` : undefined}
        submitLabel="Gửi yêu cầu"
        tone="warning"
        onClose={() => setSheet(null)}
        onSubmit={async ({ reason }, checked) => {
          await gradingActions.requestRegrade(s._id, { reason, ...(checked ? { record_error: true } : {}) });
          await onDone('Đã yêu cầu nhận xét lại', `Bài đã quay về ${grader}.`);
        }}
      />

      <ReturnSheet open={sheet === 'return'} s={s} onClose={() => setSheet(null)} onDone={onDone} />

      <ReasonSheet
        open={sheet === 'takeover'}
        title="Tự nhận xét bài này"
        hint={`Bài chuyển sang đứng tên bạn (kể cả tiền công) và chốt luôn. ${grader} bị ghi 1 lỗi nhận xét.`}
        fields={[{ key: 'reason', placeholder: 'Lý do ghi nhận lỗi (VD: nhận xét chưa đúng tiêu chí, thiếu dẫn chứng…)' }]}
        submitLabel="Ghi nhận bài về tôi"
        tone="brand"
        onClose={() => setSheet(null)}
        onSubmit={async ({ reason }) => {
          await gradingActions.takeover(s._id, { ...buildPayload(), graderFeedback: reason, record_error: true });
          await onDone('Đã ghi nhận bài về bạn', 'Kết quả đã chốt và gửi cho học viên.');
        }}
      />
    </>
  );
}

/** Bảng nhập lý do dùng chung (1–2 ô bắt buộc + ô tick tuỳ chọn). */
function ReasonSheet({
  open,
  title,
  hint,
  fields,
  checkbox,
  submitLabel,
  tone,
  extra,
  canSubmit = true,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  hint: string;
  fields: { key: string; placeholder: string; label?: string }[];
  checkbox?: string;
  submitLabel: string;
  tone: 'warning' | 'brand' | 'violet';
  extra?: React.ReactNode;
  canSubmit?: boolean;
  onClose: () => void;
  onSubmit: (values: Record<string, string>, checked: boolean) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const [values, setValues] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const filled = fields.every((f) => (values[f.key] ?? '').trim()) && canSubmit;
  const bg = tone === 'warning' ? 'bg-warning' : tone === 'violet' ? 'bg-violet' : 'bg-brand';
  const send = async () => {
    setBusy(true);
    try {
      const trimmed = Object.fromEntries(fields.map((f) => [f.key, (values[f.key] ?? '').trim()]));
      await onSubmit(trimmed, checked);
      setValues({});
      setChecked(false);
      onClose();
    } catch (err) {
      Alert.alert('Chưa gửi được', getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoider className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="gap-3 rounded-t-3xl bg-surface px-4 pt-3" style={{ paddingBottom: insets.bottom + 14 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <Text className="text-[17px] font-bold text-foreground">{title}</Text>
          <Text className="text-[13px] text-muted">{hint}</Text>
          {extra}
          {fields.map((f, i) => (
            <View key={f.key} className="gap-1.5">
              {f.label ? <Text className="text-[13px] font-semibold text-foreground">{f.label}</Text> : null}
              <TextInput
                value={values[f.key] ?? ''}
                onChangeText={(v) => setValues((p) => ({ ...p, [f.key]: v }))}
                multiline
                autoFocus={i === 0 && !extra}
                placeholder={f.placeholder}
                placeholderTextColor={muted}
                textAlignVertical="top"
                className="min-h-20 rounded-2xl bg-surface-muted p-3.5 text-[15px] text-foreground"
              />
            </View>
          ))}
          {checkbox ? (
            <Pressable
              onPress={() => setChecked((v) => !v)}
              className="flex-row items-center gap-2.5 rounded-xl bg-danger-soft px-3 py-2.5">
              <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={20} color="#dc2626" />
              <Text className="flex-1 text-[13px] text-danger">{checkbox}</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void send()}
            disabled={!filled || busy}
            className={`mt-1 h-12 flex-row items-center justify-center gap-2 rounded-2xl ${filled ? bg : 'bg-surface-muted'}`}>
            {busy ? <ActivityIndicator color="#fff" /> : null}
            <Text className={`text-[15px] font-bold ${filled ? 'text-white' : 'text-muted'}`}>{submitLabel}</Text>
          </Pressable>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

/** Chuyển người nhận xét: chọn người mới (bỏ người đang chấm + chính học viên) + lý do + lý do ghi lỗi. */
function ReturnSheet({
  open,
  s,
  onClose,
  onDone,
}: {
  open: boolean;
  s: SubmissionForGrading;
  onClose: () => void;
  onDone: (title: string, body: string) => Promise<void>;
}) {
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const graders = useGraders(open);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const options = (graders.data ?? [])
    .filter((g) => g._id !== s.feedback?.teacher_id && g._id !== s.student_id)
    .map((g) => ({ id: g._id, name: g.name || g.full_name || 'Không tên', sub: [g.role_code, g.email].filter(Boolean).join(' · ') }))
    .filter((g) => !q.trim() || `${g.name} ${g.sub}`.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 30);
  return (
    <ReasonSheet
      open={open}
      title="Chuyển người nhận xét"
      hint={`Bài giao cho người mới chấm lại từ đầu. ${s.feedback?.teacher_name ?? 'Người chấm cũ'} bị ghi 1 lỗi và nhận được lý do.`}
      canSubmit={!!picked}
      extra={
        <View className="gap-2">
          <Text className="text-[13px] font-semibold text-foreground">Người nhận xét mới</Text>
          {picked ? (
            <Pressable onPress={() => setPicked(null)} className="flex-row items-center gap-2 rounded-2xl bg-brand-soft px-3.5 py-2.5">
              <Ionicons name="person" size={16} color={brand} />
              <Text className="flex-1 text-[14.5px] font-semibold text-brand">{picked.name}</Text>
              <Text className="text-[12.5px] text-brand">Đổi</Text>
            </Pressable>
          ) : (
            <>
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Tìm tên / email…"
                placeholderTextColor={muted}
                className="h-11 rounded-full bg-surface-muted px-4 text-[15px] text-foreground"
              />
              <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="handled">
                {graders.isLoading ? <ActivityIndicator className="py-3" color={brand} /> : null}
                {options.map((o) => (
                  <Pressable
                    key={o.id}
                    onPress={() => setPicked({ id: o.id, name: o.name })}
                    className="rounded-xl px-2 py-2 active:bg-surface-muted">
                    <Text className="text-[14.5px] text-foreground">{o.name}</Text>
                    {o.sub ? <Text className="text-[12px] text-muted">{o.sub}</Text> : null}
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      }
      fields={[
        { key: 'reason', label: 'Lý do chuyển', placeholder: 'VD: người chấm cũ bận, cần chấm gấp…' },
        {
          key: 'graderFeedback',
          label: 'Lý do ghi nhận lỗi (gửi cho người chấm cũ)',
          placeholder: 'VD: nhận xét sơ sài, chưa đúng tiêu chí…',
        },
      ]}
      submitLabel="Chuyển bài"
      tone="violet"
      onClose={onClose}
      onSubmit={async ({ reason, graderFeedback }) => {
        if (!picked) return;
        await gradingActions.returnToGrading(s._id, { reason, graderFeedback, assigned_grader_id: picked.id, record_error: true });
        setPicked(null);
        await onDone('Đã chuyển người nhận xét', `Bài đã giao cho ${picked.name}.`);
      }}
    />
  );
}

/** Video + ô ghi nhận xét theo mốc: chạm "Bắt đầu"/"Kết thúc" để lấy đúng giây đang phát. */
function VideoPane({
  media,
  comments,
  setComments,
}: {
  media: Extract<Media, { kind: 'video' }>;
  comments: GradingComment[];
  setComments: React.Dispatch<React.SetStateAction<GradingComment[]>>;
}) {
  const player = useRef<YoutubePlayerHandle>(null);
  const muted = useThemeColor('muted');
  const [now, setNow] = useState(0);
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);
  const [text, setText] = useState('');
  const shownStart = start ?? Math.floor(now);

  // Điều khiển player từ danh sách nhận xét (VideoCommentList nằm ở chỗ khác trong màn).
  // Bấm 1 mốc là phát đúng đoạn đã ghi rồi DỪNG ở mốc kết thúc — người chấm đang nghe lần lượt
  // nên không lặp (bên màn kết quả của học viên thì lặp, xem segment-loop.ts).
  const segment = useSegmentPlayback(player);
  useEffect(() => {
    seekBus.current = (c) => segment.play(c);
    return () => {
      seekBus.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = () => {
    if (!text.trim()) return;
    const time = shownStart;
    const endTime = Math.max(end ?? time + 1, time + 1);
    setComments((prev) =>
      [
        ...prev,
        {
          id: `tc-${Date.now()}`,
          time,
          endTime,
          text: text.trim(),
          createdAt: new Date().toISOString(),
          videoId: media.youtubeId,
          itemKey: media.itemKey,
        },
      ].sort((a, b) => a.time - b.time),
    );
    setText('');
    setStart(null);
    setEnd(null);
    player.current?.seekTo(endTime);
  };

  return (
    <View className="border-b border-border bg-surface">
      <YoutubePlayer
        ref={player}
        videoId={media.youtubeId}
        onTime={(t) => {
          setNow(t);
          segment.check(t);
        }}
      />
      <View className="gap-2 px-3 py-2.5">
        <View className="flex-row items-center gap-2">
          <TimeChip
            label="Bắt đầu"
            value={mmss(shownStart)}
            locked={start !== null}
            onPress={() => {
              player.current?.pause();
              setStart(Math.floor(now));
            }}
          />
          <Ionicons name="arrow-forward" size={14} color={muted} />
          <TimeChip
            label="Kết thúc"
            value={end !== null ? mmss(end) : '—'}
            locked={end !== null}
            onPress={() => {
              player.current?.pause();
              setEnd(Math.floor(now));
            }}
          />
          {start !== null || end !== null ? (
            <Pressable
              onPress={() => {
                setStart(null);
                setEnd(null);
              }}
              hitSlop={8}>
              <Text className="text-[12.5px] font-semibold text-muted">Bỏ chọn</Text>
            </Pressable>
          ) : null}
          <View className="flex-1" />
          <Text className="text-[11.5px] text-muted">{comments.filter((c) => c.videoId === media.youtubeId).length} mốc</Text>
        </View>
        <View className="flex-row items-end gap-2">
          <TextInput
            value={text}
            onChangeText={setText}
            onFocus={() => {
              // Bắt đầu gõ là chốt mốc hiện tại + dừng video (web cũng lấy giây lúc bấm)
              if (start === null) setStart(Math.floor(now));
              player.current?.pause();
            }}
            placeholder={`Nhận xét tại ${mmss(shownStart)}…`}
            placeholderTextColor={muted}
            multiline
            className="max-h-24 min-h-[42px] flex-1 rounded-2xl bg-surface-muted px-3.5 py-2.5 text-[14.5px] text-foreground"
          />
          <Pressable
            onPress={add}
            disabled={!text.trim()}
            className={`h-[42px] w-[42px] items-center justify-center rounded-full ${text.trim() ? 'bg-brand' : 'bg-surface-muted'}`}>
            <Ionicons name="add" size={22} color={text.trim() ? '#fff' : muted} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** Kênh nhỏ để danh sách nhận xét (ở dưới) tua player (ở trên) mà không phải nâng ref qua nhiều tầng. */
const seekBus: { current: ((c: GradingComment) => void) | null } = { current: null };

function TimeChip({ label, value, locked, onPress }: { label: string; value: string; locked: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 active:opacity-70 ${locked ? 'bg-brand' : 'bg-brand-soft'}`}>
      <Text className={`text-[11.5px] font-semibold ${locked ? 'text-white/85' : 'text-brand'}`}>{label}</Text>
      <Text className={`text-[13px] font-extrabold ${locked ? 'text-white' : 'text-brand'}`} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
    </Pressable>
  );
}

function VideoCommentList({
  comments,
  setComments,
}: {
  comments: GradingComment[];
  setComments: React.Dispatch<React.SetStateAction<GradingComment[]>>;
}) {
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  return (
    <Section title={`Nhận xét theo thời điểm (${comments.length})`} icon="time-outline">
      {comments.length === 0 ? (
        <Text className="text-[13.5px] text-muted">
          Phát video, chạm “Bắt đầu” (và “Kết thúc” nếu cần) rồi gõ nhận xét ở ô ngay dưới video. Cần ít nhất 1 mốc.
        </Text>
      ) : (
        comments.map((c) =>
          editing?.id === c.id ? (
            <View key={c.id} className="gap-2">
              <TextInput
                value={editing.text}
                onChangeText={(t) => setEditing({ id: c.id, text: t })}
                multiline
                autoFocus
                className="rounded-xl bg-surface-muted p-3 text-[14.5px] text-foreground"
              />
              <View className="flex-row justify-end gap-4">
                <Pressable onPress={() => setEditing(null)}>
                  <Text className="text-[13.5px] font-semibold text-muted">Huỷ</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (!editing.text.trim()) return;
                    setComments((prev) => prev.map((x) => (x.id === c.id ? { ...x, text: editing.text.trim() } : x)));
                    setEditing(null);
                  }}>
                  <Text className="text-[13.5px] font-bold text-brand">Lưu</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              key={c.id}
              onPress={() => seekBus.current?.(c)}
              onLongPress={() => setEditing({ id: c.id, text: c.text })}
              className="flex-row items-start gap-2.5 rounded-xl py-1.5 active:bg-surface-muted">
              <View className="flex-row items-center gap-1 rounded-md bg-brand-soft px-2 py-0.5">
                <Ionicons name="play" size={10} color={brand} />
                <Text className="text-[12px] font-bold text-brand" style={{ fontVariant: ['tabular-nums'] }}>
                  {rangeLabel(c)}
                </Text>
              </View>
              <Text className="flex-1 text-[14px] text-foreground">{c.text}</Text>
              <Pressable onPress={() => setEditing({ id: c.id, text: c.text })} hitSlop={6}>
                <Ionicons name="create-outline" size={17} color={muted} />
              </Pressable>
              <Pressable onPress={() => setComments((prev) => prev.filter((x) => x.id !== c.id))} hitSlop={6}>
                <Ionicons name="trash-outline" size={17} color={muted} />
              </Pressable>
            </Pressable>
          ),
        )
      )}
    </Section>
  );
}

function ImageComments({
  media,
  comments,
  setComments,
  required,
}: {
  media: Extract<Media, { kind: 'image' }>;
  comments: GradingComment[];
  setComments: React.Dispatch<React.SetStateAction<GradingComment[]>>;
  required: boolean;
}) {
  const muted = useThemeColor('muted');
  const [text, setText] = useState('');
  const key = media.itemKey ?? media.key;
  const mine = comments.filter((c) => isImageComment(c) && c.itemKey === key);
  return (
    <Section title={`Nhận xét cho ${media.label}`} icon="image-outline">
      {required && !mine.length ? <Text className="text-[12.5px] text-warning">Ảnh này cần ít nhất 1 nhận xét.</Text> : null}
      {mine.map((c) => (
        <View key={c.id} className="flex-row items-start gap-2">
          <Text className="flex-1 text-[14px] text-foreground">• {c.text}</Text>
          <Pressable onPress={() => setComments((prev) => prev.filter((x) => x.id !== c.id))} hitSlop={6}>
            <Ionicons name="trash-outline" size={17} color={muted} />
          </Pressable>
        </View>
      ))}
      <View className="flex-row items-end gap-2">
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder="Nhận xét cho ảnh này…"
          placeholderTextColor={muted}
          className="max-h-24 min-h-[42px] flex-1 rounded-2xl bg-surface-muted px-3.5 py-2.5 text-[14.5px] text-foreground"
        />
        <Pressable
          disabled={!text.trim()}
          onPress={() => {
            setComments((prev) => [
              ...prev,
              { id: `ic-${Date.now()}`, time: 0, text: text.trim(), createdAt: new Date().toISOString(), kind: 'image', itemKey: key },
            ]);
            setText('');
          }}
          className={`h-[42px] w-[42px] items-center justify-center rounded-full ${text.trim() ? 'bg-brand' : 'bg-surface-muted'}`}>
          <Ionicons name="add" size={22} color={text.trim() ? '#fff' : muted} />
        </Pressable>
      </View>
    </Section>
  );
}

function NotesTab({ s }: { s: SubmissionForGrading }) {
  const notes = [
    s.status_before_claim === 'reassigned' && s.reassign_reason
      ? { title: 'Ghi chú từ người duyệt', by: s.reassigned_by_name, text: s.reassign_reason, tone: 'warning' as const }
      : null,
    s.redo_reason ? { title: 'Lý do yêu cầu làm lại', by: s.redo_requested_by_name, text: s.redo_reason, tone: 'violet' as const } : null,
    s.regrade_reason
      ? { title: 'Lý do yêu cầu chấm lại', by: s.regrade_requested_by_name, text: s.regrade_reason, tone: 'danger' as const }
      : null,
  ].filter((n): n is NonNullable<typeof n> => !!n);
  if (!notes.length)
    return (
      <StateView
        icon="information-circle-outline"
        title="Không có ghi chú nào"
        description="Ghi chú hiện khi bài được yêu cầu chấm lại hoặc làm lại."
      />
    );
  return (
    <View className="gap-3">
      {notes.map((n) => (
        <View key={n.title} className="gap-1 rounded-2xl bg-surface p-4">
          <Text
            className={`text-[12px] font-bold uppercase ${n.tone === 'warning' ? 'text-warning' : n.tone === 'violet' ? 'text-violet' : 'text-danger'}`}>
            {n.title}
            {n.by ? ` · ${n.by}` : ''}
          </Text>
          <Text className="text-[14.5px] leading-5 text-foreground">{n.text}</Text>
        </View>
      ))}
    </View>
  );
}

/** Yêu cầu học viên làm lại (quyền SUBMISSION_REDO_REQUEST) — lý do bắt buộc + hạn nộp lại tuỳ chọn. */
function RedoSheet({
  open,
  studentName,
  attempt,
  submissionId,
  onClose,
  onDone,
}: {
  open: boolean;
  studentName: string;
  attempt: number;
  submissionId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const muted = useThemeColor('muted');
  const [reason, setReason] = useState('');
  const [days, setDays] = useState<number | null>(3);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const deadline = days ? new Date(Date.now() + days * 86_400_000) : null;
      deadline?.setHours(23, 0, 0, 0);
      await gradingActions.requestRedo(submissionId, { reason: reason.trim(), redo_deadline: deadline?.toISOString() });
      onClose();
      Alert.alert('Đã gửi yêu cầu làm lại', `${studentName} sẽ nhận được thông báo.`, [{ text: 'OK', onPress: onDone }]);
    } catch (err) {
      Alert.alert('Chưa gửi được', getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoider className="flex-1 justify-end bg-black/45">
        <Pressable className="absolute inset-0" onPress={onClose} />
        <View className="gap-3 rounded-t-3xl bg-surface px-4 pt-3" style={{ paddingBottom: insets.bottom + 14 }}>
          <View className="h-1 w-10 self-center rounded-full bg-border" />
          <Text className="text-[17px] font-bold text-foreground">Yêu cầu làm lại</Text>
          <Text className="text-[13px] text-muted">
            {studentName} · đang ở lần nộp {attempt}. Mỗi bài được yêu cầu làm lại tối đa 2 lần.
          </Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            multiline
            autoFocus
            placeholder="Lý do (học viên sẽ đọc được): quay thiếu phần…, âm thanh không nghe rõ…"
            placeholderTextColor={muted}
            textAlignVertical="top"
            className="min-h-24 rounded-2xl bg-surface-muted p-3.5 text-[15px] text-foreground"
          />
          <Text className="text-[13px] font-semibold text-foreground">Hạn nộp lại</Text>
          <View className="flex-row flex-wrap gap-2">
            {[1, 2, 3, 7].map((d) => (
              <Pressable
                key={d}
                onPress={() => setDays(d)}
                className={`h-9 justify-center rounded-full px-3.5 ${days === d ? 'bg-foreground' : 'bg-surface-muted'}`}>
                <Text className={`text-[13px] font-semibold ${days === d ? 'text-background' : 'text-muted'}`}>{d} ngày</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setDays(null)}
              className={`h-9 justify-center rounded-full px-3.5 ${days === null ? 'bg-foreground' : 'bg-surface-muted'}`}>
              <Text className={`text-[13px] font-semibold ${days === null ? 'text-background' : 'text-muted'}`}>Không đặt hạn</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => void send()}
            disabled={!reason.trim() || busy}
            className={`mt-1 h-12 flex-row items-center justify-center gap-2 rounded-2xl ${reason.trim() ? 'bg-violet' : 'bg-surface-muted'}`}>
            {busy ? <ActivityIndicator color="#fff" /> : null}
            <Text className={`text-[15px] font-bold ${reason.trim() ? 'text-white' : 'text-muted'}`}>Gửi yêu cầu làm lại</Text>
          </Pressable>
        </View>
      </KeyboardAvoider>
    </Modal>
  );
}

function Section({ title, icon, children }: { title: string; icon: ComponentProps<typeof Ionicons>['name']; children: React.ReactNode }) {
  const brand = useThemeColor('brand');
  return (
    <View className="gap-3 rounded-3xl bg-surface p-4">
      <View className="flex-row items-center gap-2">
        <Ionicons name={icon} size={17} color={brand} />
        <Text className="text-[15px] font-bold text-foreground">{title}</Text>
      </View>
      {children}
    </View>
  );
}

function Pill({ text, tone }: { text: string; tone: 'violet' | 'warning' }) {
  return (
    <View className={`rounded-full px-2 py-0.5 ${tone === 'violet' ? 'bg-violet-soft' : 'bg-warning-soft'}`}>
      <Text className={`text-[11.5px] font-bold ${tone === 'violet' ? 'text-violet' : 'text-warning'}`}>{text}</Text>
    </View>
  );
}
