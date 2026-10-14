import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useNavigation } from 'expo-router';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AudioPlayer } from '@/components/ui/audio-player';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api/client';
import { useThemeColor } from '@/theme/use-theme-color';

import { submitApi, type AssignmentDetail, type QuizQuestion } from '../detail-api';
import { Notice } from '../submit/assignment-header';
import { ensureMicPermission, SpeakingRecorder } from './speaking-recorder';
import { useQuizSession, type QuizSession } from './use-quiz-session';

const TYPE_LABEL: Record<QuizQuestion['type'], string> = {
  single_choice: 'Chọn 1 đáp án',
  multiple_choice: 'Chọn nhiều đáp án',
  listening: 'Nghe và chọn đáp án',
  speaking: 'Luyện nói',
};

function clock(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Làm quiz: mỗi trang 1 câu (dễ bấm trên điện thoại), có lưới nhảy câu + đồng hồ. */
export function QuizRunner({ assignment, header }: { assignment: AssignmentDetail; header: ReactNode }) {
  const session = useQuizSession(assignment);
  const danger = useThemeColor('danger');
  const { questions, started } = session;
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [index, setIndex] = useState(0);
  const [gridOpen, setGridOpen] = useState(false);
  const [recordingKey, setRecordingKey] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const done = !!session.submittedId;
  const guard = started && !done && !session.submitting;

  // Thoát giữa chừng: giờ vẫn chạy ở server → lưu nháp và hỏi lại cho chắc.
  useEffect(() => {
    if (!guard) return;
    return navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert(
        'Thoát khỏi bài làm?',
        session.timed
          ? 'Đồng hồ vẫn tiếp tục chạy khi bạn thoát. Câu trả lời đã được lưu, bạn có thể quay lại làm tiếp.'
          : 'Câu trả lời đã được lưu, bạn có thể quay lại làm tiếp.',
        [
          { text: 'Ở lại làm bài', style: 'cancel' },
          {
            text: 'Thoát',
            style: 'destructive',
            onPress: () => {
              void session.saveDraft();
              navigation.dispatch(e.data.action);
            },
          },
        ],
      );
    });
  }, [guard, navigation, session]);

  // Nộp xong → sang trang kết quả
  useEffect(() => {
    if (!session.submittedId) return;
    const t = setTimeout(
      () => router.replace({ pathname: '/result/[id]', params: { id: session.submittedId! } }),
      session.timeExpired ? 1500 : 0,
    );
    return () => clearTimeout(t);
  }, [session.submittedId, session.timeExpired]);

  if (!started) {
    return (
      <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-4 pb-10">
        {header}
        <StartGate assignment={assignment} session={session} />
      </ScrollView>
    );
  }

  const q = questions[index];
  const last = index === questions.length - 1;

  function go(i: number) {
    setIndex(Math.max(0, Math.min(questions.length - 1, i)));
    setGridOpen(false);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  function trySubmit() {
    if (recordingKey) {
      Alert.alert('Đang ghi âm', 'Dừng ghi âm câu hiện tại trước khi nộp bài.');
      return;
    }
    if (session.missing.length) {
      const first = questions.findIndex((x) => x.key === session.missing[0].key);
      Alert.alert('Chưa làm xong', `Còn ${session.missing.length} câu chưa làm. Hoàn thành hết rồi mới nộp được.`, [
        { text: 'Tới câu chưa làm', onPress: () => go(first) },
      ]);
      return;
    }
    Alert.alert(
      'Nộp bài?',
      session.uploadingCount
        ? `Còn ${session.uploadingCount} bản thu đang lưu — hệ thống sẽ chờ lưu xong rồi nộp.`
        : 'Bài quiz chỉ nộp được 1 lần, nộp rồi không sửa được.',
      [
        { text: 'Kiểm tra lại', style: 'cancel' },
        { text: 'Nộp bài', onPress: () => void session.submit(false) },
      ],
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: `Câu ${index + 1}/${questions.length}`,
          gestureEnabled: !guard,
          headerRight: () => (session.timed ? <TimerBadge seconds={session.remaining} /> : null),
        }}
      />

      <ScrollView ref={scrollRef} className="flex-1" contentContainerClassName="gap-4 p-4 pb-8" keyboardShouldPersistTaps="handled">
        <ProgressDots session={session} index={index} onPress={() => setGridOpen(true)} />
        {session.notice ? <Notice tone="warning" icon="information-circle-outline" title={session.notice} /> : null}

        <View className="gap-4 rounded-2xl border border-border bg-surface p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold uppercase text-muted">{TYPE_LABEL[q.type]}</Text>
            <Text className="text-xs font-semibold text-muted">{q.points} điểm</Text>
          </View>
          <Text className="text-lg font-semibold leading-7 text-foreground" selectable>
            {q.prompt}
          </Text>

          {q.type === 'listening' && q.audioUrl ? <AudioPlayer uri={q.audioUrl} label="Nghe đoạn audio" /> : null}

          {q.type === 'speaking' ? (
            <SpeakingQuestion
              assignmentId={assignment._id}
              question={q}
              session={session}
              recordingKey={recordingKey}
              setRecordingKey={setRecordingKey}
            />
          ) : (
            <Options question={q} session={session} />
          )}
        </View>
      </ScrollView>

      <View className="flex-row gap-3 border-t border-border bg-surface px-4 pt-3" style={{ paddingBottom: insets.bottom + 12 }}>
        <Button title="Câu trước" variant="secondary" icon="chevron-back" disabled={index === 0} onPress={() => go(index - 1)} className="flex-1" />
        {last ? (
          <Button title="Nộp bài" icon="paper-plane" loading={session.submitting} onPress={trySubmit} className="flex-1" />
        ) : (
          <Button title="Câu sau" onPress={() => go(index + 1)} className="flex-1" />
        )}
      </View>

      <QuestionGrid visible={gridOpen} session={session} current={index} onPick={go} onClose={() => setGridOpen(false)} onSubmit={trySubmit} />

      <Modal visible={session.timeExpired || (session.submitting && !recordingKey)} transparent animationType="fade">
        <View className="flex-1 items-center justify-center bg-black/50 p-8">
          <View className="w-full items-center gap-3 rounded-2xl bg-surface p-6">
            {session.timeExpired ? <Ionicons name="alarm" size={40} color={danger} /> : null}
            <Text className="text-center text-lg font-semibold text-foreground">
              {session.timeExpired ? 'Hết giờ làm bài' : 'Đang nộp bài…'}
            </Text>
            <Text className="text-center text-sm text-muted">
              {session.submittedId ? 'Đã nộp xong, đang mở kết quả.' : 'Hệ thống đang lưu bản thu và nộp phần bạn đã làm.'}
            </Text>
            {!session.submittedId ? <ActivityIndicator /> : null}
            {session.timeExpired && !session.submitting && !session.submittedId ? (
              <Button title="Thử nộp lại" onPress={() => void session.submit(true)} />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Trước khi bắt đầu ──────────────────────────────────────────────────────

function StartGate({ assignment, session }: { assignment: AssignmentDetail; session: QuizSession }) {
  const [checking, setChecking] = useState(false);
  const hasSpeaking = session.questions.some((q) => q.type === 'speaking');
  const resuming = !!assignment.quiz_draft;

  async function begin() {
    // Bài có câu nói mà không có micro thì vào làm là mất trắng điểm câu đó → xin quyền trước.
    if (hasSpeaking) {
      setChecking(true);
      const ok = await ensureMicPermission();
      setChecking(false);
      if (!ok) return;
    }
    session.start();
  }

  return (
    <View className="gap-4">
      <View className="gap-3 rounded-2xl border border-border bg-surface p-4">
        <Text className="text-lg font-semibold text-foreground">{resuming ? 'Làm tiếp bài quiz' : 'Sẵn sàng làm bài?'}</Text>
        <Rule icon="list-outline" text={`${session.questions.length} câu hỏi`} />
        {session.timed ? (
          <Rule icon="timer-outline" text={`${resuming ? 'Còn lại' : 'Thời gian'} ${clock(session.remaining)} — đồng hồ chạy cả khi bạn thoát app`} />
        ) : null}
        <Rule icon="alert-circle-outline" text="Bài chỉ nộp được 1 lần. Hết giờ hệ thống tự nộp phần đã làm." />
        {hasSpeaking ? <Rule icon="mic-outline" text="Có câu luyện nói — nên làm ở nơi yên tĩnh, cần cấp quyền micro." /> : null}
      </View>
      <Button title={resuming ? 'Làm tiếp' : 'Làm ngay'} icon="play" loading={checking} onPress={begin} />
    </View>
  );
}

function Rule({ icon, text }: { icon: ComponentProps<typeof Ionicons>['name']; text: string }) {
  const brand = useThemeColor('brand');
  return (
    <View className="flex-row items-start gap-2.5">
      <Ionicons name={icon} size={18} color={brand} />
      <Text className="flex-1 text-sm text-foreground">{text}</Text>
    </View>
  );
}

// ─── Câu trắc nghiệm ────────────────────────────────────────────────────────

function Options({ question, session }: { question: QuizQuestion; session: QuizSession }) {
  const onBrand = useThemeColor('on-brand');
  const chosen = session.selected[question.key] ?? [];
  const multi = question.type === 'multiple_choice';

  return (
    <View className="gap-2.5">
      {(question.options ?? []).map((opt, i) => {
        const on = chosen.includes(opt.key);
        return (
          <Pressable
            key={opt.key}
            onPress={() => session.toggleChoice(question, opt.key)}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={{ checked: on }}
            className={`flex-row items-center gap-3 rounded-xl border p-3.5 active:opacity-80 ${on ? 'border-brand bg-brand-soft' : 'border-border bg-surface'}`}>
            <View
              className={`h-8 w-8 items-center justify-center ${multi ? 'rounded-lg' : 'rounded-full'} ${on ? 'bg-brand' : 'border border-border bg-surface-muted'}`}>
              {on ? <Ionicons name="checkmark" size={18} color={onBrand} /> : <Text className="text-sm font-semibold text-muted">{String.fromCharCode(65 + i)}</Text>}
            </View>
            <Text className="flex-1 text-base text-foreground">{opt.text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Câu nói ────────────────────────────────────────────────────────────────

function SpeakingQuestion({
  assignmentId,
  question,
  session,
  recordingKey,
  setRecordingKey,
}: {
  assignmentId: string;
  question: QuizQuestion;
  session: QuizSession;
  recordingKey: string | null;
  setRecordingKey: (k: string | null) => void;
}) {
  const [sampleUrl, setSampleUrl] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  async function loadSample() {
    setLoadingSample(true);
    try {
      const res = await submitApi.speakingSample(assignmentId, question.key);
      setSampleUrl(res.data.data?.url ?? null);
    } catch (err) {
      Alert.alert('Chưa có câu mẫu', getErrorMessage(err));
    } finally {
      setLoadingSample(false);
    }
  }

  return (
    <View className="gap-3">
      {question.referenceText ? (
        <View className="rounded-xl bg-surface-muted p-3.5">
          <Text className="text-xs font-semibold uppercase text-muted">Đọc câu sau</Text>
          <Text className="pt-1 text-lg font-semibold leading-7 text-foreground" selectable>
            {question.referenceText}
          </Text>
        </View>
      ) : null}
      {question.audioUrl ? <AudioPlayer uri={question.audioUrl} label="Audio câu hỏi" /> : null}
      {sampleUrl ? (
        <AudioPlayer uri={sampleUrl} label="Phát âm mẫu" />
      ) : question.referenceText ? (
        <Button title="Nghe phát âm mẫu" icon="volume-high-outline" variant="ghost" loading={loadingSample} onPress={loadSample} />
      ) : null}

      <SpeakingRecorder
        state={session.speaking[question.key]}
        savedUrl={session.savedAudioUrls[question.key]}
        busyElsewhere={!!recordingKey && recordingKey !== question.key}
        onRecordingChange={(on) => setRecordingKey(on ? question.key : null)}
        onRecorded={(uri) => session.uploadRecording(question.key, uri)}
      />
    </View>
  );
}

// ─── Điều hướng câu ─────────────────────────────────────────────────────────

function TimerBadge({ seconds }: { seconds: number }) {
  const low = seconds <= 60;
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${low ? 'bg-danger' : 'bg-brand-soft'}`}>
      <Text className={`text-sm font-bold ${low ? 'text-on-brand' : 'text-brand'}`} style={{ fontVariant: ['tabular-nums'] }}>
        {clock(seconds)}
      </Text>
    </View>
  );
}

function ProgressDots({ session, index, onPress }: { session: QuizSession; index: number; onPress: () => void }) {
  const answered = session.questions.length - session.missing.length;
  return (
    <Pressable onPress={onPress} className="gap-2 active:opacity-80">
      <View className="flex-row justify-between">
        <Text className="text-sm text-muted">
          Đã làm {answered}/{session.questions.length} câu
        </Text>
        <Text className="text-sm font-semibold text-brand">Xem tất cả câu</Text>
      </View>
      <View className="flex-row gap-1">
        {session.questions.map((q, i) => (
          <View
            key={q.key}
            className={`h-1.5 flex-1 rounded-full ${i === index ? 'bg-brand' : session.isAnswered(q) ? 'bg-success' : 'bg-surface-muted'}`}
          />
        ))}
      </View>
    </Pressable>
  );
}

function QuestionGrid({
  visible,
  session,
  current,
  onPick,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  session: QuizSession;
  current: number;
  onPick: (i: number) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40" onPress={onClose} />
      <View className="gap-4 rounded-t-3xl bg-surface p-5" style={{ paddingBottom: insets.bottom + 16 }}>
        <Text className="text-lg font-semibold text-foreground">Danh sách câu hỏi</Text>
        <View className="flex-row flex-wrap gap-2.5">
          {session.questions.map((q, i) => {
            const answered = session.isAnswered(q);
            return (
              <Pressable
                key={q.key}
                onPress={() => onPick(i)}
                className={`h-11 w-11 items-center justify-center rounded-full border ${i === current ? 'border-brand bg-brand' : answered ? 'border-success bg-success-soft' : 'border-border bg-surface-muted'}`}>
                <Text className={`text-sm font-bold ${i === current ? 'text-on-brand' : answered ? 'text-success' : 'text-muted'}`}>
                  {i + 1}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Button
          title="Nộp bài"
          icon="paper-plane"
          onPress={() => {
            onClose();
            onSubmit();
          }}
        />
      </View>
    </Modal>
  );
}
