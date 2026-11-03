import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useActionSheet } from '@/components/ui/action-sheet';
import { Button } from '@/components/ui/button';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Segmented } from '@/components/ui/segmented';
import { showToast } from '@/components/ui/toast';
import { getErrorMessage } from '@/lib/api/client';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { useThemeColor } from '@/theme/use-theme-color';

import { blankCount, scoreBlanks, scoreHard, scoreSentence, tokenize, wordMatches } from './scoring';
import {
  LEVEL_LABEL,
  type DictationLesson,
  type DictationLevel,
  type DictationProgress,
  type DictationSavePayload,
  type DictationSentence,
} from './types';

/**
 * Một bài nghe chép chính tả — bản mobile của `DictationLessonView` trong class-fe
 * (my-classes/[classId]/renderers/DictationRenderer.tsx). Dùng chung cho bài luyện tập E-Learning
 * `listen_dictation` và bài tập Speak Your Mind: `onSave` lưu ở đâu là việc của màn bọc ngoài.
 *
 * Luồng giống web: từng câu nghe → điền ô (Dễ/Vừa) hoặc chép cả câu (Khó) → Kiểm tra (hiện đáp án,
 * IPA, nghĩa) → câu tiếp; xong hết thì "Xem kết quả" (finish) → tổng kết + transcript. Lưu nháp sau
 * mỗi lần gõ (hoãn 800ms), lưu ngay khi kiểm tra. Bỏ so với web: trình phát cả bài có sáng câu theo
 * thời gian và phím tắt — app chỉ có nút "Nghe cả bài".
 */

const LEVELS: { value: DictationLevel; hint: string }[] = [
  { value: 'easy', hint: 'Điền một số từ khoá' },
  { value: 'medium', hint: 'Điền mọi từ khoá' },
  { value: 'hard', hint: 'Chép cả câu' },
];
const SPEEDS = [0.5, 0.75, 1];
const SAVE_DEBOUNCE_MS = 800;
/** Nghỉ một nhịp giữa 2 lần lặp câu cho học viên kịp gõ (giống web) */
const LOOP_GAP_MS = 900;

interface PracticeState {
  level: DictationLevel;
  answers: Record<string, string[]>;
  checked: number[];
  hints: Record<string, number>;
}

const emptyState = (level: DictationLevel): PracticeState => ({ level, answers: {}, checked: [], hints: {} });
const percentOf = (correct: number, total: number) => (total > 0 ? Math.round((correct / total) * 100) : 0);

// ─── Audio: 1 player cho cả màn, phát câu nào thì thay nguồn ─────────────────

interface DictationAudio {
  playingUrl: string | null;
  loading: boolean;
  play: (url: string, options?: { loop?: boolean }) => void;
  stop: () => void;
}

function useDictationAudio(speed: number): DictationAudio {
  const { data: mediaToken } = useMediaToken();
  const tokenRef = useRef(mediaToken?.media_token);
  useEffect(() => {
    tokenRef.current = mediaToken?.media_token;
  }, [mediaToken?.media_token]);
  const playerRef = useRef<AudioPlayer | null>(null);
  const loopRef = useRef(false);
  const loopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speedRef = useRef(speed);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void setAudioModeAsync({ playsInSilentMode: true });
    const player = createAudioPlayer(null, { updateInterval: 250 });
    playerRef.current = player;
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.isLoaded && status.playing) setLoading(false);
      if (!status.didJustFinish) return;
      if (loopRef.current) {
        loopTimer.current = setTimeout(() => {
          void player.seekTo(0).then(() => player.play());
        }, LOOP_GAP_MS);
      } else {
        setPlayingUrl(null);
      }
    });
    return () => {
      if (loopTimer.current) clearTimeout(loopTimer.current);
      sub.remove();
      player.remove();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    speedRef.current = speed;
    playerRef.current?.setPlaybackRate(speed);
  }, [speed]);

  const stop = useCallback(() => {
    if (loopTimer.current) clearTimeout(loopTimer.current);
    loopRef.current = false;
    playerRef.current?.pause();
    setPlayingUrl(null);
    setLoading(false);
  }, []);

  const play = useCallback((url: string, options: { loop?: boolean } = {}) => {
    const player = playerRef.current;
    const uri = resolveMediaUrl(url, tokenRef.current);
    if (!player || !uri) {
      showToast('error', 'Chưa phát được audio', 'Đợi vài giây rồi thử lại.');
      return;
    }
    if (loopTimer.current) clearTimeout(loopTimer.current);
    loopRef.current = !!options.loop;
    setLoading(true);
    setPlayingUrl(url);
    player.replace({ uri });
    player.setPlaybackRate(speedRef.current);
    player.play();
  }, []);

  return { playingUrl, loading, play, stop };
}

// ─── Màn một bài nghe ───────────────────────────────────────────────────────

export function DictationLessonView({
  lesson,
  progress,
  onSave,
  header,
  notice,
  passScore,
  lockedLevel,
  hintLimit,
  onNextLesson,
}: {
  lesson: DictationLesson;
  progress: DictationProgress | null;
  onSave: (payload: DictationSavePayload) => Promise<DictationProgress | null>;
  /** Phần đầu riêng của màn bọc ngoài — VD tên bài tập + hạn nộp */
  header?: ReactNode;
  /** Thông báo dưới đầu bài — VD đã hoàn thành / quá hạn */
  notice?: ReactNode;
  /** Bài tập SYM: phải đúng TRÊN mức này (%) mới tính xong + mở transcript */
  passScore?: number;
  /** Bài tập SYM giáo viên đã chọn mức: chỉ làm mức này, không đổi được */
  lockedLevel?: DictationLevel | null;
  /** Bài tập SYM: số lần gợi ý tối đa mỗi câu */
  hintLimit?: number;
  onNextLesson?: () => void;
}) {
  const sheet = useActionSheet();
  const mutedColor = useThemeColor('muted');
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  // Bài làm ở mức khác mức được giao (giáo viên đổi mức) thì bỏ, làm lại ở mức mới — như web.
  const usable = progress && (!lockedLevel || progress.level === lockedLevel) ? progress : null;
  const [state, setState] = useState<PracticeState>(() =>
    usable
      ? { level: usable.level, answers: usable.answers || {}, checked: usable.checked || [], hints: usable.hints || {} }
      : emptyState(lockedLevel || 'medium'),
  );
  const [completedAt, setCompletedAt] = useState(progress?.completed_at || null);
  const [view, setView] = useState<'practice' | 'review'>(() =>
    usable && (usable.checked || []).length >= lesson.sentences.length ? 'review' : 'practice',
  );
  const [speed, setSpeed] = useState(1);
  const [savedProgress, setSavedProgress] = useState(progress);
  const audio = useDictationAudio(speed);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Bản mới nhất của bài làm — gõ xong bấm Kiểm tra ngay vẫn lấy đúng chữ cuối.
  const stateRef = useRef(state);
  const update = (fn: (prev: PracticeState) => PracticeState) => {
    const next = fn(stateRef.current);
    stateRef.current = next;
    setState(next);
    return next;
  };

  const save = useCallback(
    async (next: PracticeState, flags: { finish?: boolean; reset?: boolean } = {}) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      const totals = next.checked.reduce(
        (sum, i) => {
          const s = scoreSentence(lesson.sentences[i], next.level, next.answers[String(i)]);
          return { correct: sum.correct + s.correct, total: sum.total + s.total };
        },
        { correct: 0, total: 0 },
      );
      try {
        const saved = await onSaveRef.current({ level: next.level, answers: next.answers, checked: next.checked, hints: next.hints, ...totals, ...flags });
        if (saved) setSavedProgress(saved);
        return saved;
      } catch (err) {
        showToast('error', 'Chưa lưu được bài làm', getErrorMessage(err, 'Kiểm tra mạng rồi thử lại.'));
        return null;
      }
    },
    [lesson.sentences],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const saveLater = (next: PracticeState) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(next), SAVE_DEBOUNCE_MS);
  };

  const onAnswer = (index: number, values: string[]) => saveLater(update((p) => ({ ...p, answers: { ...p.answers, [String(index)]: values } })));
  const onHint = (index: number) =>
    saveLater(update((p) => ({ ...p, hints: { ...p.hints, [String(index)]: (p.hints[String(index)] || 0) + 1 } })));
  const onCheck = (index: number) =>
    void save(update((p) => ({ ...p, checked: p.checked.includes(index) ? p.checked : [...p.checked, index] })));

  const onFinish = async () => {
    audio.stop();
    const saved = await save(stateRef.current, { finish: true });
    if (saved) {
      setCompletedAt(saved.completed_at);
      setView('review');
    }
  };

  const startOver = async (level: DictationLevel) => {
    audio.stop();
    const next = update(() => emptyState(level));
    setView('practice');
    await save(next, { reset: true });
  };

  /** Đổi mức giữa chừng = làm lại từ đầu → hỏi trước nếu đã kiểm tra câu nào */
  const changeLevel = (level: DictationLevel) => {
    if (level === state.level) return;
    if (view === 'practice' && state.checked.length === 0) {
      void save(update(() => emptyState(level)));
      return;
    }
    sheet.confirm({
      title: 'Đổi mức và làm lại từ đầu?',
      message: 'Bài đang làm ở mức hiện tại sẽ bị xoá. Điểm cao nhất của bạn vẫn được giữ.',
      label: 'Làm lại',
      onConfirm: () => void startOver(level),
    });
  };

  const totalBlanks = useMemo(
    () => lesson.sentences.reduce((sum, s) => sum + blankCount(s, state.level), 0),
    [lesson.sentences, state.level],
  );

  return (
    <View className="gap-3">
      <View className="gap-2 rounded-2xl bg-brand-soft px-4 py-3">
        {header}
        <Text className="text-[15px] font-bold text-foreground">
          Tuần {lesson.week} · {lesson.unit} — {lesson.title}
        </Text>
        <Text className="text-[12.5px] text-muted">
          {lesson.subtitle ? `${lesson.subtitle} · ` : ''}
          {lesson.sentences.length} câu · {totalBlanks} từ cần {state.level === 'hard' ? 'chép' : 'điền'}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2 pt-1">
          {lockedLevel ? (
            <View className="flex-row items-center gap-1.5 rounded-full bg-surface px-3 py-1.5">
              <Ionicons name="lock-closed" size={12} color={mutedColor} />
              <Text className="text-[12.5px] font-semibold text-foreground">Mức {LEVEL_LABEL[lockedLevel]} (giáo viên giao)</Text>
            </View>
          ) : (
            LEVELS.map((l) => {
              const active = l.value === state.level;
              return (
                <Pressable
                  key={l.value}
                  onPress={() => changeLevel(l.value)}
                  className={`rounded-full px-3 py-1.5 ${active ? 'bg-brand' : 'bg-surface'}`}>
                  <Text className={`text-[12.5px] font-semibold ${active ? 'text-on-brand' : 'text-foreground'}`}>{LEVEL_LABEL[l.value]}</Text>
                </Pressable>
              );
            })
          )}
          {view === 'practice' && completedAt ? (
            <Pressable onPress={() => setView('review')} className="rounded-full bg-surface px-3 py-1.5">
              <Text className="text-[12.5px] font-semibold text-brand">Xem transcript</Text>
            </Pressable>
          ) : null}
        </View>
        {!lockedLevel ? <Text className="text-[11.5px] text-muted">{LEVELS.find((l) => l.value === state.level)?.hint}</Text> : null}
      </View>

      {notice}

      {view === 'practice' ? (
        <PracticePanel
          key={state.level}
          lesson={lesson}
          state={state}
          audio={audio}
          speed={speed}
          onSpeedChange={setSpeed}
          onAnswer={onAnswer}
          onHint={onHint}
          onCheck={onCheck}
          onFinish={() => void onFinish()}
          hintLimit={hintLimit}
        />
      ) : (
        <ReviewPanel
          lesson={lesson}
          state={state}
          progress={savedProgress}
          audio={audio}
          passScore={passScore}
          levelLocked={!!lockedLevel}
          onRedo={() => void startOver(state.level)}
          onResume={() => {
            audio.stop();
            setView('practice');
          }}
          onNextLesson={
            onNextLesson
              ? () => {
                  audio.stop();
                  onNextLesson();
                }
              : undefined
          }
        />
      )}
    </View>
  );
}

// ─── Làm từng câu ───────────────────────────────────────────────────────────

function PracticePanel({
  lesson,
  state,
  audio,
  speed,
  onSpeedChange,
  onAnswer,
  onHint,
  onCheck,
  onFinish,
  hintLimit,
}: {
  lesson: DictationLesson;
  state: PracticeState;
  audio: DictationAudio;
  speed: number;
  onSpeedChange: (speed: number) => void;
  onAnswer: (index: number, values: string[]) => void;
  onHint: (index: number) => void;
  onCheck: (index: number) => void;
  onFinish: () => void;
  hintLimit?: number;
}) {
  const onBrand = useThemeColor('on-brand');
  const muted = useThemeColor('muted');
  const warning = useThemeColor('warning');
  const brand = useThemeColor('brand');
  const sentences = lesson.sentences;
  const firstUnchecked = sentences.findIndex((_, i) => !state.checked.includes(i));
  const [current, setCurrent] = useState(firstUnchecked < 0 ? sentences.length - 1 : firstUnchecked);
  const [loop, setLoop] = useState(false);
  const inputs = useRef<(TextInput | null)[]>([]);
  const focused = useRef(0);

  const sentence = sentences[current];
  const isChecked = state.checked.includes(current);
  const answers = state.answers[String(current)] || [];
  const allChecked = state.checked.length >= sentences.length;
  const isPlaying = !!sentence && audio.playingUrl === sentence.audio;

  // Mới vào bài lần đầu thì chưa tự phát (học viên tự bấm nghe); sang câu mới thì tự phát như web.
  const fresh = useRef(state.checked.length === 0);
  useEffect(() => {
    if (!sentence) return;
    if (fresh.current) fresh.current = false;
    else if (!state.checked.includes(current)) audio.play(sentence.audio, { loop });
    focused.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  useEffect(() => {
    if (isPlaying) audio.play(sentence.audio, { loop });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loop]);

  if (!sentence) return null;

  const goNext = () => {
    const next = sentences.findIndex((_, i) => i > current && !state.checked.includes(i));
    const target = next >= 0 ? next : sentences.findIndex((_, i) => !state.checked.includes(i));
    if (target >= 0) setCurrent(target);
  };

  const primary = () => {
    if (!isChecked) {
      audio.stop();
      onCheck(current);
      return;
    }
    if (allChecked) onFinish();
    else goNext();
  };

  const setAnswer = (blank: number, value: string) => {
    const next = [...answers];
    next[blank] = value;
    onAnswer(current, next);
  };

  const hintsUsed = state.hints[String(current)] || 0;
  const hintsLeft = hintLimit === undefined ? null : Math.max(0, hintLimit - hintsUsed);

  /** Gợi ý: điền thêm 1 chữ đúng vào ô đang đứng (mỗi lần có chữ mới là 1 lượt) */
  const hint = () => {
    if (isChecked || hintsLeft === 0) return;
    const prefixLen = (typed: string, expected: string) => {
      let same = 0;
      while (same < typed.length && typed[same].toLowerCase() === expected[same]?.toLowerCase()) same++;
      return same;
    };
    if (state.level === 'hard') {
      const typed = answers[0] || '';
      const same = prefixLen(typed, sentence.text);
      if (same >= sentence.text.length) return;
      setAnswer(0, sentence.text.slice(0, same + 1));
      onHint(current);
      inputs.current[0]?.focus();
      return;
    }
    const blanks = tokenize(sentence.text, state.level).filter((t) => t.blank);
    const index = Math.min(focused.current, blanks.length - 1);
    const expected = blanks[index]?.word || '';
    const typed = answers[index] || '';
    if (wordMatches(typed, expected, sentence.accept)) return;
    setAnswer(index, expected.slice(0, prefixLen(typed, expected) + 1));
    onHint(current);
    inputs.current[index]?.focus();
  };

  const tokens = tokenize(sentence.text, state.level);
  let blankIndex = 0;
  const blanksTotal = tokens.filter((t) => t.blank).length;
  const sentenceScore = isChecked ? scoreSentence(sentence, state.level, answers) : null;

  return (
    <View className="gap-3">
      {/* Tiến độ từng câu — câu đã kiểm tra bấm vào xem lại được */}
      <View className="flex-row items-center gap-2">
        <View className="flex-1 flex-row items-center gap-[3px]">
          {sentences.map((item, i) => {
            const done = state.checked.includes(i);
            const s = done ? scoreSentence(item, state.level, state.answers[String(i)]) : null;
            const color = !s ? 'bg-surface-muted' : s.correct === s.total ? 'bg-success' : s.correct === 0 ? 'bg-danger' : 'bg-warning';
            return (
              <Pressable
                key={i}
                hitSlop={{ top: 8, bottom: 8 }}
                onPress={() => (done || i === firstUnchecked) && setCurrent(i)}
                className={`flex-1 rounded-full ${color} ${i === current ? 'h-2.5' : 'h-1.5'}`}
              />
            );
          })}
        </View>
        <Text className="text-[12px] font-bold text-muted">
          {state.checked.length}/{sentences.length}
        </Text>
      </View>

      <View className="overflow-hidden rounded-3xl border border-border bg-surface">
        {/* Thanh phát */}
        <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
          <Pressable
            onPress={() => (isPlaying ? audio.stop() : audio.play(sentence.audio, { loop }))}
            accessibilityLabel={isPlaying ? 'Dừng' : 'Nghe câu'}
            className="h-12 w-12 items-center justify-center rounded-full bg-brand active:opacity-80">
            <Ionicons name={isPlaying ? (audio.loading ? 'hourglass' : 'pause') : 'play'} size={20} color={onBrand} />
          </Pressable>
          <Text className="flex-1 text-[16px] font-bold text-foreground">
            Câu {current + 1}
            <Text className="font-medium text-muted"> / {sentences.length}</Text>
          </Text>
          <View className="flex-row items-center gap-0.5 rounded-full bg-surface-muted p-1">
            <Pressable onPress={() => setLoop((v) => !v)} className={`h-8 justify-center rounded-full px-2.5 ${loop ? 'bg-surface' : ''}`}>
              <Ionicons name="repeat" size={16} color={loop ? brand : muted} />
            </Pressable>
            {SPEEDS.map((v) => (
              <Pressable key={v} onPress={() => onSpeedChange(v)} className={`h-8 justify-center rounded-full px-2 ${speed === v ? 'bg-surface' : ''}`}>
                <Text className={`text-[12px] font-bold ${speed === v ? 'text-brand' : 'text-muted'}`}>{v}x</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Câu đang làm */}
        <View className="px-4 py-6">
          {isChecked ? (
            <View className="gap-4">
              {state.level === 'hard' ? (
                <CheckedHard sentence={sentence} typed={answers[0] || ''} />
              ) : (
                <CheckedBlanks sentence={sentence} level={state.level} answers={answers} />
              )}
              {sentenceScore ? <SentenceScoreBadge {...sentenceScore} /> : null}
            </View>
          ) : state.level === 'hard' ? (
            <TextInput
              ref={(el) => {
                inputs.current[0] = el;
              }}
              value={answers[0] || ''}
              onChangeText={(v) => setAnswer(0, v)}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              placeholder="Gõ lại cả câu bạn nghe được…"
              placeholderTextColor={muted}
              className="min-h-[96px] rounded-2xl border-2 border-border bg-surface-muted px-4 py-3 text-[17px] text-foreground"
              style={{ textAlignVertical: 'top' }}
            />
          ) : (
            <View className="flex-row flex-wrap items-center justify-center gap-y-2">
              {tokens.map((token, i) => {
                if (!token.blank) {
                  return (
                    <Text key={i} className="mr-1.5 text-[19px] leading-9 text-foreground">
                      {token.lead}
                      {token.word}
                      {token.trail}
                    </Text>
                  );
                }
                const blank = blankIndex++;
                const last = blank === blanksTotal - 1;
                return (
                  <View key={i} className="mr-1.5 flex-row items-center">
                    {token.lead ? <Text className="text-[19px] text-foreground">{token.lead}</Text> : null}
                    <TextInput
                      ref={(el) => {
                        inputs.current[blank] = el;
                      }}
                      value={answers[blank] || ''}
                      onChangeText={(v) => setAnswer(blank, v)}
                      onFocus={() => (focused.current = blank)}
                      onSubmitEditing={() => (last ? primary() : inputs.current[blank + 1]?.focus())}
                      returnKeyType={last ? 'done' : 'next'}
                      submitBehavior={last ? 'blurAndSubmit' : 'submit'}
                      autoCapitalize="none"
                      autoCorrect={false}
                      spellCheck={false}
                      autoComplete="off"
                      accessibilityLabel={`Ô trống ${blank + 1}`}
                      className="h-10 rounded-xl border-2 border-dashed border-brand bg-brand-soft px-2 text-center text-[17px] font-semibold text-foreground"
                      style={{ minWidth: Math.max(token.word.length, 3) * 11 + 20 }}
                    />
                    {token.trail ? <Text className="text-[19px] text-foreground">{token.trail}</Text> : null}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {isChecked ? <SentenceReveal sentence={sentence} /> : null}

        {/* Chân thẻ */}
        <View className="flex-row items-center justify-between gap-2 border-t border-border bg-surface-muted px-4 py-3">
          {!isChecked ? (
            <Pressable onPress={hint} disabled={hintsLeft === 0} className={`flex-row items-center gap-1.5 py-2 ${hintsLeft === 0 ? 'opacity-50' : ''}`}>
              <Ionicons name="bulb-outline" size={16} color={warning} />
              <Text className="text-[13.5px] font-semibold text-muted">
                {hintsLeft === 0 ? 'Hết gợi ý' : 'Gợi ý 1 chữ'}
                {hintsLeft !== null && hintsLeft > 0 ? ` (còn ${hintsLeft})` : ''}
              </Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Button
            title={!isChecked ? 'Kiểm tra' : allChecked ? 'Xem kết quả' : 'Câu tiếp theo'}
            icon={!isChecked ? 'checkmark' : allChecked ? 'checkmark-done' : 'arrow-forward'}
            onPress={primary}
            className="h-11 px-5"
          />
        </View>
      </View>

      {!isChecked ? (
        <Text className="text-center text-[12px] text-muted">Kiểm tra xong sẽ hiện đáp án, IPA và nghĩa tiếng Việt của câu.</Text>
      ) : null}
    </View>
  );
}

function SentenceScoreBadge({ correct, total }: { correct: number; total: number }) {
  const all = correct === total;
  return (
    <View className={`self-center rounded-full px-3 py-1 ${all ? 'bg-success-soft' : correct === 0 ? 'bg-danger-soft' : 'bg-warning-soft'}`}>
      <Text className={`text-[13px] font-bold ${all ? 'text-success' : correct === 0 ? 'text-danger' : 'text-warning'}`}>
        {all ? 'Chính xác! ' : ''}
        {correct}/{total} từ đúng
      </Text>
    </View>
  );
}

/** IPA + nghĩa tiếng Việt của câu, hiện sau khi kiểm tra */
function SentenceReveal({ sentence }: { sentence: DictationSentence }) {
  return (
    <View className="gap-1 border-t border-border px-4 py-3">
      <Text className="text-[15px] font-semibold text-foreground">{sentence.text}</Text>
      {sentence.ipa ? <Text className="text-[13px] text-muted">{sentence.ipa}</Text> : null}
      {sentence.vi ? <Text className="text-[13.5px] text-foreground">{sentence.vi}</Text> : null}
    </View>
  );
}

// ─── Câu đã chấm ────────────────────────────────────────────────────────────

function CheckedBlanks({ sentence, level, answers, compact }: { sentence: DictationSentence; level: DictationLevel; answers: string[]; compact?: boolean }) {
  const tokens = tokenize(sentence.text, level);
  const results = scoreBlanks(sentence, level, answers);
  let b = 0;
  const size = compact ? 'text-[13.5px] leading-6' : 'text-[18px] leading-9';
  return (
    <Text className={`${compact ? '' : 'text-center'} ${size} text-foreground`}>
      {tokens.map((token, i) => {
        if (!token.blank) return <Fragment key={i}>{`${token.lead}${token.word}${token.trail} `}</Fragment>;
        const r = results[b++];
        return (
          <Fragment key={i}>
            {token.lead}
            {r.status === 'correct' ? (
              <Text className="font-semibold text-success">{r.answer}</Text>
            ) : r.status === 'wrong' ? (
              <>
                <Text className="text-danger line-through">{r.answer}</Text> <Text className="font-semibold text-success">{r.expected}</Text>
              </>
            ) : (
              <Text className="font-semibold text-warning underline">{r.expected}</Text>
            )}
            {`${token.trail} `}
          </Fragment>
        );
      })}
    </Text>
  );
}

function CheckedHard({ sentence, typed, compact }: { sentence: DictationSentence; typed: string; compact?: boolean }) {
  const result = scoreHard(sentence, typed);
  const size = compact ? 'text-[13.5px] leading-6' : 'text-[17px] leading-7';
  return (
    <View className="gap-2">
      <View>
        <Text className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">Bài của bạn</Text>
        <Text className={size}>
          {result.typed.length === 0 ? (
            <Text className="italic text-muted">(Chưa gõ gì)</Text>
          ) : (
            result.typed.map((w, i) => (
              <Text key={i} className={w.status === 'correct' ? 'text-success' : 'text-danger line-through'}>
                {w.word}{' '}
              </Text>
            ))
          )}
        </Text>
      </View>
      <View>
        <Text className="mb-0.5 text-[11px] font-bold uppercase tracking-wide text-muted">Đáp án</Text>
        <Text className={`${size} text-foreground`}>
          {result.expected.map((w, i) => (
            <Text key={i} className={w.status === 'missing' ? 'font-semibold text-warning underline' : ''}>
              {w.word}{' '}
            </Text>
          ))}
        </Text>
      </View>
    </View>
  );
}

// ─── Tổng kết + transcript ──────────────────────────────────────────────────

function ReviewPanel({
  lesson,
  state,
  progress,
  audio,
  passScore,
  levelLocked,
  onRedo,
  onResume,
  onNextLesson,
}: {
  lesson: DictationLesson;
  state: PracticeState;
  progress: DictationProgress | null;
  audio: DictationAudio;
  passScore?: number;
  levelLocked: boolean;
  onRedo: () => void;
  onResume: () => void;
  onNextLesson?: () => void;
}) {
  const brand = useThemeColor('brand');
  const warning = useThemeColor('warning');
  const [tab, setTab] = useState<'transcript' | 'vocab'>('transcript');
  const hasAnswers = state.checked.length >= lesson.sentences.length;

  const totals = useMemo(
    () =>
      lesson.sentences.reduce(
        (sum, s, i) => {
          const r = scoreSentence(s, state.level, state.answers[String(i)]);
          return { correct: sum.correct + r.correct, total: sum.total + r.total, perfect: sum.perfect + (r.correct === r.total ? 1 : 0) };
        },
        { correct: 0, total: 0, perfect: 0 },
      ),
    [lesson.sentences, state],
  );
  const score = percentOf(totals.correct, totals.total);
  // Bài tập SYM chưa lần nào đạt → khoá transcript, không thì xem đáp án rồi làm lại là qua (như web).
  const locked = passScore !== undefined && !progress?.completed_at;
  const verdict = locked
    ? { title: 'Chưa đạt', note: `Cần đúng trên ${passScore}% số từ mới hoàn thành bài tập — nghe lại rồi làm lại nhé.` }
    : score >= 90
      ? { title: 'Xuất sắc!', note: 'Tai bạn bắt chữ rất tốt.' }
      : score >= 70
        ? { title: 'Làm tốt lắm!', note: 'Xem lại vài chỗ sai bên dưới nhé.' }
        : score >= 40
          ? { title: 'Cố lên một chút nữa!', note: 'Nghe lại từng câu rồi làm lại để nhớ lâu hơn.' }
          : { title: 'Đừng nản nhé!', note: levelLocked ? 'Bật tốc độ 0.75x rồi nghe lại từng câu nhé.' : 'Thử mức Dễ và bật tốc độ 0.75x.' };
  const playingFull = audio.playingUrl === lesson.audio;

  return (
    <View className="gap-3">
      {hasAnswers ? (
        <View className="gap-3 rounded-3xl border border-border bg-surface p-4">
          <View className="flex-row items-center gap-4">
            <ProgressRing percent={score} size={72} stroke={7} color={locked ? 'warning' : 'brand'}>
              <Text className="text-[17px] font-bold text-foreground">{score}%</Text>
            </ProgressRing>
            <View className="flex-1 gap-0.5">
              <Text className="text-[19px] font-bold text-foreground">{verdict.title}</Text>
              <Text className="text-[13px] leading-5 text-muted">
                {totals.correct}/{totals.total} từ đúng · {verdict.note}
              </Text>
            </View>
          </View>
          <View className="flex-row gap-2">
            <Stat label="Câu đúng hết" value={`${totals.perfect}/${lesson.sentences.length}`} />
            <Stat label="Cao nhất" value={`${progress?.best_score ?? score}%`} />
            <Stat label="Số lần làm" value={String(progress?.attempts ?? 1)} />
          </View>
          <View className="flex-row gap-2">
            <Button title="Làm lại" icon="refresh" variant="secondary" onPress={onRedo} className="h-11 flex-1" />
            {onNextLesson && !locked ? <Button title="Bài tiếp" icon="arrow-forward" onPress={onNextLesson} className="h-11 flex-1" /> : null}
          </View>
        </View>
      ) : (
        <View className="flex-row items-center gap-3 rounded-2xl bg-surface p-4">
          <Text className="flex-1 text-[13.5px] text-muted">Bạn đang làm dở {state.checked.length}/{lesson.sentences.length} câu.</Text>
          <Button title="Làm tiếp" onPress={onResume} className="h-10 px-4" />
        </View>
      )}

      {locked ? (
        <View className="flex-row items-start gap-2 rounded-2xl bg-warning-soft p-3.5">
          <Ionicons name="lock-closed" size={16} color={warning} />
          <Text className="flex-1 text-[13px] leading-5 text-foreground">Transcript và từ vựng sẽ mở khi bạn đạt trên {passScore}%.</Text>
        </View>
      ) : (
        <>
          <Pressable
            onPress={() => (playingFull ? audio.stop() : audio.play(lesson.audio))}
            className="flex-row items-center justify-center gap-2 rounded-2xl bg-surface py-3 active:opacity-80">
            <Ionicons name={playingFull ? 'stop-circle' : 'headset'} size={18} color={brand} />
            <Text className="text-[14px] font-semibold text-brand">{playingFull ? 'Dừng' : 'Nghe cả bài'}</Text>
          </Pressable>

          {lesson.vocabulary?.length ? (
            <Segmented
              items={[
                { value: 'transcript', label: 'Transcript' },
                { value: 'vocab', label: `Từ vựng (${lesson.vocabulary.length})` },
              ]}
              value={tab}
              onChange={setTab}
            />
          ) : null}

          {tab === 'transcript' ? (
            <View className="overflow-hidden rounded-2xl bg-surface">
              {lesson.sentences.map((s, i) => {
                const mine = state.answers[String(i)];
                const playing = audio.playingUrl === s.audio;
                return (
                  <View key={i} className={`gap-1.5 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                    <View className="flex-row items-start gap-2">
                      <Pressable hitSlop={8} onPress={() => (playing ? audio.stop() : audio.play(s.audio))} className="pt-0.5">
                        <Ionicons name={playing ? 'pause-circle' : 'play-circle'} size={22} color={brand} />
                      </Pressable>
                      <View className="flex-1 gap-0.5">
                        <Text className="text-[14.5px] font-semibold text-foreground">{s.text}</Text>
                        {s.ipa ? <Text className="text-[12.5px] text-muted">{s.ipa}</Text> : null}
                        {s.vi ? <Text className="text-[13px] text-foreground">{s.vi}</Text> : null}
                      </View>
                    </View>
                    {hasAnswers && state.checked.includes(i) ? (
                      <View className="ml-8 rounded-xl bg-surface-muted px-3 py-2">
                        {state.level === 'hard' ? (
                          <CheckedHard sentence={s} typed={mine?.[0] || ''} compact />
                        ) : (
                          <CheckedBlanks sentence={s} level={state.level} answers={mine || []} compact />
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <View className="overflow-hidden rounded-2xl bg-surface">
              {lesson.vocabulary.map((v, i) => {
                const playing = audio.playingUrl === v.audio;
                return (
                  <View key={`${v.word}-${i}`} className={`flex-row gap-2 px-4 py-3 ${i > 0 ? 'border-t border-border' : ''}`}>
                    {v.audio ? (
                      <Pressable hitSlop={8} onPress={() => (playing ? audio.stop() : audio.play(v.audio))} className="pt-0.5">
                        <Ionicons name={playing ? 'pause-circle' : 'volume-high'} size={20} color={brand} />
                      </Pressable>
                    ) : null}
                    <View className="flex-1 gap-0.5">
                      <Text className="text-[14.5px] font-semibold text-foreground">
                        {v.word} <Text className="text-[12.5px] font-normal text-muted">{[v.pos, v.ipa].filter(Boolean).join(' · ')}</Text>
                      </Text>
                      <Text className="text-[13px] text-foreground">{v.vi}</Text>
                      {v.example ? <Text className="text-[12.5px] italic text-muted">{v.example}</Text> : null}
                      {v.exampleVi ? <Text className="text-[12.5px] text-muted">{v.exampleVi}</Text> : null}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 items-center rounded-2xl bg-surface-muted py-2">
      <Text className="text-[16px] font-bold text-foreground">{value}</Text>
      <Text className="text-[11.5px] text-muted">{label}</Text>
    </View>
  );
}
