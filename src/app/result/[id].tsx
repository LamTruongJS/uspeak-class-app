import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { AudioPlayer } from '@/components/ui/audio-player';
import { Badge } from '@/components/ui/badge';
import { ProgressRing } from '@/components/ui/progress-ring';
import { RichText } from '@/components/ui/rich-text';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { YoutubePlayer, type YoutubePlayerHandle } from '@/components/ui/youtube-player';
import {
  SUBMISSION_STATUS,
  useSubmissionResult,
  type QuizQuestion,
  type SubmissionResult,
  type TimestampComment,
} from '@/features/assignments/detail-api';
import { rangeLabel, useSegmentPlayback } from '@/features/assignments/segment-loop';
import { SpeakingFeedback } from '@/features/assignments/quiz/speaking-feedback';
import { ImageViewer } from '@/features/chat/message-content';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { extractYoutubeVideoId } from '@/lib/youtube';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor, type ThemeColor } from '@/theme/use-theme-color';

/**
 * Kết quả bài nộp của học viên — port từ uspeak-class-fe assignments/result/[id]/page.tsx (phần học viên).
 * Quiz: điểm từng câu + đáp án đúng/sai + nhận xét phát âm. Bài video/ảnh: điểm, tiêu chí, nhận xét
 * của giáo viên, nhận xét theo mốc thời gian — video phát NGAY TRONG APP (YoutubePlayer), bấm mốc là tua
 * tới đúng giây đó; ảnh mở bằng trình xem ảnh của app. Không bật app YouTube / trình duyệt.
 * `?staff=1`: nhân viên xem bài đã chấm (endpoint /assignments/submissions/:id).
 */

const fmtScore = (v?: number | null) => (v == null || !Number.isFinite(Number(v)) ? '—' : String(Math.round(Number(v) * 10) / 10));

export default function ResultScreen() {
  const { id, staff } = useLocalSearchParams<{ id: string; staff?: string }>();
  // Nhân viên (lịch sử nhận xét, bài đã chấm) xem cùng màn này qua endpoint của người chấm
  const { data, isLoading, isError, error, refetch } = useSubmissionResult(id, staff === '1');
  const pull = usePullRefresh(refetch);
  const brand = useThemeColor('brand');

  if (isLoading)
    return (
      <Shell>
        <LoadingView />
      </Shell>
    );
  if (isError || !data) {
    return (
      <Shell>
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được kết quả"
          description={getErrorMessage(error)}
          actionLabel="Thử lại"
          onAction={() => refetch()}
        />
      </Shell>
    );
  }

  const isQuiz = data.assignment_type?.code === 'quiz' || (data.quiz_questions?.length ?? 0) > 0;
  const noGrading = data.requires_grading === false || data.grading_exempt === true;
  const status =
    noGrading && data.status === 'completed'
      ? { label: 'Không cần chấm', tone: 'violet' as const }
      : (SUBMISSION_STATUS[data.status] ?? { label: data.status, tone: 'neutral' as const });

  return (
    <Shell>
      <ScrollView
        contentContainerClassName="gap-4 p-4 pb-12"
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
        <View className="gap-2 rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row flex-wrap gap-1.5">
            <Badge label={status.label} tone={status.tone} dot />
            {data.is_late ? <Badge label="Nộp trễ" tone="warning" /> : null}
            {data.attempt_number > 1 ? <Badge label={`Lần nộp ${data.attempt_number}`} /> : null}
            {data.assignment_type?.label ? <Badge label={data.assignment_type.label} tone="info" /> : null}
          </View>
          <Text className="text-xl font-bold text-foreground">{data.assignment_title}</Text>
          <Text className="text-sm text-muted">
            {data.class_code || data.class_name} · nộp lúc {formatDateTime(data.submitted_at)}
          </Text>
        </View>

        {isQuiz ? <QuizResultView data={data} /> : <GradedView data={data} noGrading={noGrading} />}
      </ScrollView>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Kết quả' }} />
      {children}
    </View>
  );
}

// ─── Quiz ───────────────────────────────────────────────────────────────────

function QuizResultView({ data }: { data: SubmissionResult }) {
  const questions = data.quiz_questions ?? [];
  const answers = new Map((data.quiz_answers ?? []).map((a) => [a.questionKey, a]));
  const results = new Map((data.quiz_results ?? []).map((r) => [r.questionKey, r]));
  const total = Number(data.quiz_total_score ?? 0);
  const max = Number(data.quiz_max_score ?? 0) || questions.reduce((s, q) => s + Number(q.points || 0), 0) || 10;
  // Câu trắc nghiệm = câu CÓ chấm đúng/sai (câu nói chấm theo điểm phát âm, không có đúng/sai)
  const judged = (data.quiz_results ?? []).filter((r) => r.isCorrect !== undefined && r.isCorrect !== null);
  const correct = judged.filter((r) => r.isCorrect === true).length;
  const pct = max ? Math.round((total / max) * 100) : 0;

  return (
    <View className="gap-4">
      <QuizScoreHero total={total} max={max} pct={pct} correct={correct} judged={judged.length} questions={questions.length} />

      {questions.map((q, i) => (
        <QuizQuestionResult key={q.key} index={i} question={q} answer={answers.get(q.key)} result={results.get(q.key)} />
      ))}
    </View>
  );
}

/** Thẻ điểm quiz — cùng ngôn ngữ thiết kế với thẻ điểm bài chấm tay (vòng tròn + câu động viên). */
function QuizScoreHero({
  total,
  max,
  pct,
  correct,
  judged,
  questions,
}: {
  total: number;
  max: number;
  pct: number;
  correct: number;
  judged: number;
  questions: number;
}) {
  const tone = scoreTone(pct);
  const color = useThemeColor(tone);
  const muted = useThemeColor('muted');
  const mt = motivation(pct);

  return (
    <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
      <View className="flex-row items-center gap-4">
        <ProgressRing percent={pct} size={92} stroke={8} color={tone}>
          <View className="items-center">
            <Text className="text-[26px] font-extrabold leading-7" style={{ color }}>
              {fmtScore(total)}
            </Text>
            <Text className="text-[11px] font-semibold text-muted">/ {fmtScore(max)}</Text>
          </View>
        </ProgressRing>
        <View className="flex-1 gap-1">
          <Text className="text-[15px] font-bold text-foreground">
            {mt.emoji} {mt.text}
          </Text>
          {judged ? (
            <View className="flex-row items-center gap-1.5">
              <Ionicons name="checkmark-circle-outline" size={14} color={muted} />
              <Text className="text-[12.5px] text-muted">
                Đúng {correct}/{judged} câu trắc nghiệm
              </Text>
            </View>
          ) : null}
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="help-circle-outline" size={14} color={muted} />
            <Text className="text-[12.5px] text-muted">{questions} câu · đạt {pct}%</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function QuizQuestionResult({
  index,
  question,
  answer,
  result,
}: {
  index: number;
  question: QuizQuestion;
  answer?: { selectedKeys?: string[]; audioUrl?: string };
  result?: NonNullable<SubmissionResult['quiz_results']>[number];
}) {
  const success = useThemeColor('success');
  const danger = useThemeColor('danger');
  const chosen = answer?.selectedKeys ?? result?.selectedKeys ?? [];
  const wrong = result?.isCorrect === false;

  return (
    <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
      <View className="flex-row items-start gap-3">
        <View className="h-8 w-8 items-center justify-center rounded-lg bg-brand-soft">
          <Text className="text-sm font-bold text-brand">{index + 1}</Text>
        </View>
        <Text className="flex-1 text-base font-semibold text-foreground">{question.prompt}</Text>
        <Text className="text-sm font-semibold text-muted">
          {fmtScore(result?.score)}/{fmtScore(result?.maxScore ?? question.points)}
        </Text>
      </View>

      {question.type === 'speaking' ? (
        <View className="gap-3">
          {question.referenceText ? <Text className="text-base text-foreground">{question.referenceText}</Text> : null}
          {question.audioUrl ? <AudioPlayer uri={question.audioUrl} label="Audio câu mẫu" /> : null}
          {answer?.audioUrl ? (
            <AudioPlayer uri={answer.audioUrl} label="Bản thu của bạn" />
          ) : (
            <Text className="text-sm text-muted">Không có bản thu</Text>
          )}
          {result ? <SpeakingFeedback result={result} /> : null}
        </View>
      ) : (
        <View className="gap-2">
          {question.type === 'listening' && question.audioUrl ? <AudioPlayer uri={question.audioUrl} label="Audio câu hỏi" /> : null}
          {(question.options ?? []).map((opt, i) => {
            const picked = chosen.includes(opt.key);
            const isAnswer = question.correctKeys?.includes(opt.key);
            const cls =
              picked && !wrong
                ? 'border-success bg-success-soft'
                : picked && wrong
                  ? 'border-danger bg-danger-soft'
                  : isAnswer
                    ? 'border-success bg-success-soft'
                    : 'border-border bg-surface';
            return (
              <View key={opt.key} className={`flex-row items-center gap-3 rounded-xl border p-3 ${cls}`}>
                <Text className="flex-1 text-base text-foreground">
                  {String.fromCharCode(65 + i)}. {opt.text}
                </Text>
                {picked && !wrong ? <Ionicons name="checkmark-circle" size={20} color={success} /> : null}
                {picked && wrong ? <Ionicons name="close-circle" size={20} color={danger} /> : null}
                {!picked && isAnswer && wrong ? <Ionicons name="checkmark-circle-outline" size={20} color={success} /> : null}
              </View>
            );
          })}
          {question.explanation ? (
            <View className="rounded-xl bg-info-soft p-3">
              <Text className="text-xs font-semibold uppercase text-info">Giải thích</Text>
              <Text className="pt-0.5 text-sm text-foreground">{question.explanation}</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ─── Bài video / ảnh / nhiều mục ────────────────────────────────────────────

function GradedView({ data, noGrading }: { data: SubmissionResult; noGrading: boolean }) {
  const fb = data.feedback;
  const comments = fb?.timestamp_comments ?? [];

  // Nhóm media: bài nhiều mục theo từng mục; bài thường là 1 nhóm
  const groups: { label?: string; videos: string[]; images: string[] }[] = data.submitted_items?.length
    ? data.submitted_items.map((it) => ({ label: it.label, videos: it.video_urls ?? [], images: it.image_urls ?? [] }))
    : [
        {
          videos: data.video_urls?.length ? data.video_urls : data.video_url ? [data.video_url] : [],
          images: data.image_urls ?? [],
        },
      ];

  const imageComments = comments.filter((c) => c.kind === 'image');

  return (
    <View className="gap-4">
      {noGrading ? (
        <InfoCard
          icon="checkmark-done-circle-outline"
          title="Bài không cần chấm"
          body="Bạn đã hoàn thành bài này. Bài không có điểm và không tính vào điểm trung bình."
        />
      ) : fb ? (
        <>
          <ScoreHero fb={fb} />
          <CriteriaCard scores={fb.criteria_scores ?? []} criteria={data.grading_criteria} />
          {fb.text_feedback ? (
            <Card icon="chatbubble-ellipses-outline" title="Nhận xét của giáo viên" tone="brand">
              <View className="rounded-xl bg-info-soft p-3">
                <RichText html={fb.text_feedback} />
              </View>
              <View className="flex-row items-center justify-between pt-2.5">
                <Text className="text-[11.5px] text-muted" numberOfLines={1}>
                  {fb.teacher_name || 'Giáo viên'}
                </Text>
                <Text className="text-[11.5px] text-muted">{formatDateTime(fb.graded_at)}</Text>
              </View>
            </Card>
          ) : null}
        </>
      ) : (
        <InfoCard
          icon="hourglass-outline"
          title="Đang chờ giáo viên nhận xét"
          body="Khi có nhận xét, bạn sẽ thấy điểm và góp ý chi tiết ở đây."
        />
      )}

      {groups.map((g, gi) => (
        <View key={gi} className="gap-3">
          {g.label ? <Text className="text-base font-semibold text-foreground">{g.label}</Text> : null}
          {g.videos.map((url, vi) => {
            const vid = extractYoutubeVideoId(url);
            const own = comments.filter((c) => c.kind !== 'image' && (!c.videoId || c.videoId === vid));
            return vid ? <VideoWithComments key={`${vid}-${vi}`} videoId={vid} comments={own} /> : null;
          })}
          {g.images.length ? <ImageGrid urls={g.images} /> : null}
        </View>
      ))}

      {imageComments.length ? (
        <Card icon="image-outline" title={`Nhận xét trên ảnh (${imageComments.length})`} tone="info">
          {imageComments.map((c) => (
            <View key={c.id} className="flex-row gap-2 py-1">
              <Text className="text-sm text-muted">•</Text>
              <Text className="flex-1 text-sm text-foreground">{c.text}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Yêu cầu của bài — bên web là 2 tab riêng; ở app gấp lại cho khỏi chiếm màn hình */}
      {data.assignment_description ? (
        <Collapsible icon="list-outline" title="Yêu cầu bài tập">
          <RichText html={data.assignment_description} />
        </Collapsible>
      ) : null}
      {data.assignment_review_requirement ? (
        <Collapsible icon="checkbox-outline" title="Yêu cầu nhận xét">
          <RichText html={data.assignment_review_requirement} />
        </Collapsible>
      ) : null}
    </View>
  );
}

/** Câu động viên theo % điểm — chép từ `getMotivation` của web để hai bên nói giống nhau. */
function motivation(pct: number) {
  if (pct >= 90) return { emoji: '🏆', text: 'Xuất sắc! Bạn làm rất tốt!' };
  if (pct >= 80) return { emoji: '🌟', text: 'Tốt lắm! Tiếp tục phát huy!' };
  if (pct >= 70) return { emoji: '💪', text: 'Khá tốt! Cố gắng thêm nhé!' };
  if (pct >= 60) return { emoji: '📚', text: 'Cần cải thiện thêm một chút.' };
  return { emoji: '🔥', text: 'Đừng nản! Thử lại lần nữa nhé!' };
}

/** Màu điểm theo tỉ lệ đạt — cùng ngưỡng với web (90 / 75 / 60). */
function scoreTone(pct: number): ThemeColor {
  if (pct >= 75) return 'success';
  if (pct >= 60) return 'warning';
  return 'danger';
}

/**
 * Thẻ điểm: vòng tròn % + điểm trên THANG THẬT (web hiện "8.1 / 10", trước đây app chỉ hiện "8.1"
 * nên không biết thang mấy), câu động viên, người nhận xét và các dấu "nhận xét lần N" / "đã sửa".
 */
function ScoreHero({ fb }: { fb: NonNullable<SubmissionResult['feedback']> }) {
  const score = averageScore(fb.criteria_scores ?? [], fb.score);
  const pct = Math.round((score / SCORE_MAX) * 100);
  const tone = scoreTone(pct);
  const color = useThemeColor(tone);
  const muted = useThemeColor('muted');
  const mt = motivation(pct);

  return (
    <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
      <View className="flex-row items-center gap-4">
        <ProgressRing percent={pct} size={92} stroke={8} color={tone}>
          <View className="items-center">
            <Text className="text-[26px] font-extrabold leading-7" style={{ color }}>
              {fmtScore(score)}
            </Text>
            <Text className="text-[11px] font-semibold text-muted">/ {SCORE_MAX}</Text>
          </View>
        </ProgressRing>
        <View className="flex-1 gap-1">
          <Text className="text-[15px] font-bold text-foreground">
            {mt.emoji} {mt.text}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="person-circle-outline" size={14} color={muted} />
            <Text className="flex-1 text-[12.5px] text-muted" numberOfLines={1}>
              {fb.teacher_name || 'Giáo viên'}
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="time-outline" size={13} color={muted} />
            <Text className="text-[12.5px] text-muted">{formatDateTime(fb.graded_at)}</Text>
          </View>
        </View>
      </View>

      {(fb.grading_round ?? 1) > 1 || fb.edit_count ? (
        <View className="flex-row flex-wrap gap-1.5 border-t border-border pt-3">
          {(fb.grading_round ?? 1) > 1 ? <Badge label={`Nhận xét lần ${fb.grading_round}`} tone="warning" /> : null}
          {fb.edit_count ? (
            <Badge
              label={`Đã chỉnh sửa ${fb.edit_count} lần${fb.last_edited_by_name ? ` · ${fb.last_edited_by_name}` : ''}`}
              tone="neutral"
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Điểm bài luôn trên THANG 10 và bằng TRUNG BÌNH CỘNG điểm các tiêu chí — đúng công thức của web
 * (`totalScore` trong assignments/result/[id]/page.tsx). Mỗi tiêu chí tự có thang riêng (thường
 * cũng là 10) nên **đừng cộng dồn maxScore làm mẫu số**: 4 tiêu chí thang 10 sẽ ra "8.1/40", nhìn
 * như trượt trong khi thực tế là 8.1/10. Sửa công thức này thì sửa cả bên web.
 */
const SCORE_MAX = 10;

function averageScore(scores: { score: number }[], fallback?: number | null): number {
  if (!scores.length) return Number(fallback ?? 0);
  const sum = scores.reduce((acc, c) => acc + (Number(c.score) || 0), 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

/** Bảng tiêu chí: tên + mô tả + điểm/thang + thanh màu, kèm dòng tổng ở cuối (giống web). */
function CriteriaCard({
  scores,
  criteria,
}: {
  scores: NonNullable<SubmissionResult['feedback']>['criteria_scores'];
  criteria: SubmissionResult['grading_criteria'];
}) {
  const muted = useThemeColor('muted');
  if (!scores?.length) return null;
  const avg = averageScore(scores);
  // Mô tả tiêu chí nằm ở rubric của bài tập, bản chấm chỉ lưu điểm → tra ngược theo tên
  const describe = (name: string) => scores.find((c) => c.name === name)?.description || criteria?.find((c) => c.name === name)?.description;

  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-surface">
      <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
        <View className="flex-row items-center gap-2">
          <Ionicons name="star-outline" size={16} color={muted} />
          <Text className="text-[14px] font-bold text-foreground">Tiêu chí nhận xét</Text>
        </View>
        <Text className="text-[11.5px] text-muted">{scores.length} tiêu chí</Text>
      </View>

      {scores.map((c, i) => {
        const cmax = Number(c.maxScore) || 0;
        const pct = cmax > 0 ? Math.round(((Number(c.score) || 0) / cmax) * 100) : 0;
        const desc = describe(c.name);
        return (
          <View key={`${c.name}-${i}`} className={`gap-1.5 px-4 py-3 ${i ? 'border-t border-border' : ''}`}>
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-[14px] font-semibold text-foreground">{c.name}</Text>
                {desc ? (
                  <Text className="pt-0.5 text-[11.5px] text-muted" numberOfLines={2}>
                    {desc}
                  </Text>
                ) : null}
              </View>
              <Text className="text-[15px] font-bold text-foreground">
                {fmtScore(c.score)}
                <Text className="text-[12px] font-medium text-muted">/{cmax}</Text>
              </Text>
            </View>
            <Bar percent={pct} tone={scoreTone(pct)} />
          </View>
        );
      })}

      <View className="flex-row items-center justify-between border-t border-border bg-surface-muted px-4 py-2.5">
        {/* Web gọi đúng tên dòng này là "Điểm trung bình" — nó là trung bình cộng các tiêu chí */}
        <Text className="text-[12px] font-bold uppercase tracking-wide text-muted">Điểm trung bình</Text>
        <Text className="text-[15px] font-extrabold text-foreground">
          {fmtScore(avg)}
          <Text className="text-[12px] font-medium text-muted">/{SCORE_MAX}</Text>
        </Text>
      </View>
    </View>
  );
}

function Bar({ percent, tone }: { percent: number; tone: ThemeColor }) {
  const color = useThemeColor(tone);
  return (
    <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
      <View className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, percent))}%`, backgroundColor: color }} />
    </View>
  );
}

/** Thẻ có tiêu đề + icon, dùng chung cho các khối nội dung. */
function Card({
  icon,
  title,
  tone = 'brand',
  children,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  tone?: ThemeColor;
  children: ReactNode;
}) {
  const color = useThemeColor(tone);
  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      <View className="flex-row items-center gap-2 pb-2.5">
        <Ionicons name={icon} size={16} color={color} />
        <Text className="text-[14px] font-bold text-foreground">{title}</Text>
      </View>
      {children}
    </View>
  );
}

/** Khối gấp được — dành cho nội dung dài (yêu cầu bài tập, yêu cầu nhận xét). */
function Collapsible({
  icon,
  title,
  children,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const muted = useThemeColor('muted');
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-surface">
      <Pressable onPress={() => setOpen((v) => !v)} className="flex-row items-center gap-2 px-4 py-3 active:bg-surface-muted">
        <Ionicons name={icon} size={16} color={muted} />
        <Text className="flex-1 text-[14px] font-bold text-foreground">{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={muted} />
      </Pressable>
      {open ? <View className="border-t border-border px-4 py-3">{children}</View> : null}
    </View>
  );
}

function VideoWithComments({ videoId, comments }: { videoId: string; comments: TimestampComment[] }) {
  const brand = useThemeColor('brand');
  const player = useRef<YoutubePlayerHandle>(null);
  const [now, setNow] = useState(0);
  // Bấm 1 mốc = phát LẶP đúng đoạn đó (start → end, nghỉ 1 giây rồi quay lại đầu), như bản web.
  const loop = useSegmentPlayback(player, { repeat: true });
  const sorted = [...comments].sort((a, b) => a.time - b.time);
  // Mốc đang chạy qua: từ time tới endTime (không có endTime thì tới mốc kế tiếp / +5 giây)
  const playingId = sorted.find((c, i) => now >= c.time && now < (c.endTime ?? sorted[i + 1]?.time ?? c.time + 5))?.id;

  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-surface">
      <YoutubePlayer
        ref={player}
        videoId={videoId}
        onTime={(t) => {
          setNow(t);
          loop.check(t);
        }}
      />
      {sorted.length ? (
        <View className="gap-1 p-3">
          <Text className="pb-1 text-sm font-semibold text-foreground">Nhận xét theo thời điểm ({sorted.length})</Text>
          <Text className="pb-1 text-xs text-muted">Bấm vào mốc để nghe lại đúng đoạn đó; nhận xét có đoạn sẽ tự lặp, bấm lần nữa để dừng.</Text>
          {sorted.map((c) => {
            const looping = c.id === loop.activeId;
            const on = looping || c.id === playingId;
            return (
              <Pressable
                key={c.id}
                onPress={() => loop.play(c)}
                className={`flex-row items-start gap-3 rounded-lg px-1.5 py-2 active:bg-surface-muted ${on ? 'bg-brand-soft' : ''}`}>
                <View className={`flex-row items-center gap-1 rounded-md px-2 py-0.5 ${on ? 'bg-brand' : 'bg-brand-soft'}`}>
                  <Ionicons name={looping ? 'repeat' : 'play'} size={10} color={on ? '#fff' : brand} />
                  <Text className={`text-xs font-bold ${on ? 'text-white' : 'text-brand'}`} style={{ fontVariant: ['tabular-nums'] }}>
                    {rangeLabel(c)}
                  </Text>
                </View>
                <Text className="flex-1 text-sm text-foreground">{c.text}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function ImageGrid({ urls }: { urls: string[] }) {
  const [viewer, setViewer] = useState<string | null>(null);
  return (
    <View className="flex-row flex-wrap gap-2">
      {urls.map((u) => (
        <Pressable key={u} onPress={() => setViewer(u)} className="active:opacity-80">
          <Image source={{ uri: u }} style={{ width: 104, height: 104, borderRadius: 12 }} contentFit="cover" />
        </Pressable>
      ))}
      <ImageViewer uri={viewer} onClose={() => setViewer(null)} />
    </View>
  );
}

function InfoCard({ icon, title, body }: { icon: ComponentProps<typeof Ionicons>['name']; title: string; body: string }) {
  const info = useThemeColor('info');
  return (
    <View className="flex-row items-start gap-3 rounded-2xl bg-info-soft p-4">
      <Ionicons name={icon} size={22} color={info} />
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-semibold text-info">{title}</Text>
        <Text className="text-sm text-foreground">{body}</Text>
      </View>
    </View>
  );
}
