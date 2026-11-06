import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { useActionSheet } from '@/components/ui/action-sheet';
import { Button } from '@/components/ui/button';
import { StateView } from '@/components/ui/state-view';
import { ClassLockedView, classLockOf } from '@/features/classes/class-locked';
import { showToast } from '@/components/ui/toast';
import { api, getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';

import { useTvstAudio } from './audio';
import { blankKeysOf, CodeSwitchExam, GapFillExam, TranslateExam } from './exams';
import type { TvstBizAnswers, TvstBizAssignmentData, TvstSection, TvstStep } from './types';

/**
 * Bài tập TVST Business (STEP 4–6, máy tự chấm thang 10) — bản mobile của class-fe
 * my-assignments/[id]/submit/AssignmentTvstBusinessPractice.tsx. Có `studentId` = giáo viên xem bài của
 * học viên đó (chỉ đọc, kèm đáp án). Kết quả hiện ngay trên màn này — loại bài này không có trang /result.
 *
 * Lưu nháp theo từng phần (gõ ngừng ~1 giây mới gửi), bản dự phòng trong AsyncStorage phòng mất mạng.
 * Nộp xong làm lại được không giới hạn (POST …/retry), điểm lần nộp mới nhất được ghi nhận.
 */

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const EMPTY: TvstBizAnswers = { codeswitch_a: {}, codeswitch_b: {}, translation: {}, gapfill: {} };
const SECTIONS: TvstSection[] = ['codeswitch_a', 'codeswitch_b', 'translation', 'gapfill'];
const STEP_LABELS: Record<TvstStep, string> = { 4: 'Truyện chêm', 5: 'Dịch câu', 6: 'Điền chỗ trống' };

const asMap = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, string>) : {});
function answersFromSections(sections: TvstBizAssignmentData['sections'] | undefined): TvstBizAnswers {
  return {
    codeswitch_a: asMap(sections?.codeswitch_a?.answers),
    codeswitch_b: asMap(sections?.codeswitch_b?.answers),
    translation: asMap(sections?.translation?.drafts),
    gapfill: asMap(sections?.gapfill?.answers),
  };
}
const filled = (map: Record<string, string>) => Object.values(map).filter((v) => String(v || '').trim()).length;

const storageKey = (assignmentId: string) => `tvst-biz-assignment:${assignmentId}`;

export function TvstBusinessAssignment({ assignmentId, studentId }: { assignmentId: string; studentId?: string }) {
  const qc = useQueryClient();
  const sheet = useActionSheet();
  const isReviewer = !!studentId;
  const query = useQuery({
    queryKey: ['assignments', 'tvst-business', assignmentId, studentId || 'me'],
    queryFn: async () =>
      (
        await api.get<{ data: TvstBizAssignmentData }>(
          studentId ? `/assignments/${assignmentId}/tvst-business/students/${studentId}` : `/assignments/${assignmentId}/tvst-business`,
        )
      ).data.data,
  });
  const data = query.data;

  /** Kết quả vừa nộp trong phiên — đè lên dữ liệu tải ban đầu */
  const [submittedView, setSubmittedView] = useState<Pick<TvstBizAssignmentData, 'submitted_at' | 'result' | 'unit' | 'sections'> | null>(null);
  const view = data ? { ...data, ...(submittedView ?? {}) } : undefined;
  const submitted = !!view?.submitted_at;
  const readOnly = isReviewer || submitted;
  const result = view?.result ?? undefined;
  const unit = view?.unit;

  const [answers, setAnswers] = useState<TvstBizAnswers>(EMPTY);
  const answersRef = useRef<TvstBizAnswers>(EMPTY);
  const seededFor = useRef<unknown>(null);

  // Gốc bài làm: bản trên server; server trống (mất mạng lúc lưu) thì lấy bản dự phòng trên máy.
  useEffect(() => {
    if (!data || seededFor.current === data) return;
    seededFor.current = data;
    let cancelled = false;
    void (async () => {
      let seed = answersFromSections(data.sections);
      const serverEmpty = SECTIONS.every((s) => filled(seed[s]) === 0);
      if (!isReviewer && !data.submitted_at && serverEmpty) {
        try {
          const backup = JSON.parse((await AsyncStorage.getItem(storageKey(assignmentId))) || 'null');
          if (backup) seed = { ...EMPTY, ...backup };
        } catch {
          // bản dự phòng hỏng — bỏ qua
        }
      }
      if (cancelled) return;
      answersRef.current = seed;
      setAnswers(seed);
    })();
    return () => {
      cancelled = true;
    };
  }, [data, isReviewer, assignmentId]);

  // ─── Lưu nháp: gom các lần gõ, ngừng ~1 giây mới gửi phần vừa sửa ───
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const timers = useRef<Partial<Record<TvstSection, ReturnType<typeof setTimeout>>>>({});
  const inflight = useRef(0);

  const sendDraft = useCallback(
    (section: TvstSection) => {
      delete timers.current[section];
      const map = answersRef.current[section];
      inflight.current++;
      setSaveStatus('saving');
      api
        .put(`/assignments/${assignmentId}/tvst-business/draft`, {
          section,
          data: section === 'translation' ? { drafts: map, seen: [] } : { answers: map },
        })
        .then(() => {
          inflight.current--;
          if (inflight.current === 0) setSaveStatus('saved');
        })
        .catch(() => {
          inflight.current--;
          setSaveStatus('error');
        });
    },
    [assignmentId, setSaveStatus],
  );

  const flushDrafts = useCallback(
    (send: boolean) => {
      for (const section of Object.keys(timers.current) as TvstSection[]) {
        clearTimeout(timers.current[section]);
        if (send) sendDraft(section);
        else delete timers.current[section];
      }
    },
    [sendDraft],
  );
  // Rời màn khi còn nháp chưa gửi → gửi nốt
  useEffect(() => () => flushDrafts(true), [flushDrafts]);

  const updateAnswer = (section: TvstSection, key: string, value: string) => {
    if (readOnly) return;
    const next = { ...answersRef.current, [section]: { ...answersRef.current[section], [key]: value } };
    answersRef.current = next;
    setAnswers(next);
    void AsyncStorage.setItem(storageKey(assignmentId), JSON.stringify(next)).catch(() => undefined);
    clearTimeout(timers.current[section]);
    timers.current[section] = setTimeout(() => sendDraft(section), 1000);
    setSaveStatus('saving');
  };

  // ─── Step ───
  // React Compiler tự nhớ — không bọc useMemo (unit lấy từ object gộp mới mỗi lần render).
  const steps: TvstStep[] = [];
  if (unit?.codeswitch.vi_en.length || unit?.codeswitch.en_vi.length) steps.push(4);
  if (unit?.translation.length) steps.push(5);
  if (unit?.gapfill.length) steps.push(6);
  const [step, setStep] = useState<TvstStep>(4);
  const activeStep = steps.includes(step) ? step : steps[0];
  const audio = useTvstAudio();

  const stepTotals: Record<TvstStep, number> = unit
    ? {
        4: blankKeysOf(unit.codeswitch.vi_en).length + blankKeysOf(unit.codeswitch.en_vi).length,
        5: unit.translation.length,
        6: unit.gapfill.length,
      }
    : { 4: 0, 5: 0, 6: 0 };
  const stepFilled: Record<TvstStep, number> = {
    4: filled(answers.codeswitch_a) + filled(answers.codeswitch_b),
    5: filled(answers.translation),
    6: filled(answers.gapfill),
  };
  const totalItems = steps.reduce((s, st) => s + stepTotals[st], 0);
  const totalFilled = steps.reduce((s, st) => s + Math.min(stepFilled[st], stepTotals[st]), 0);

  // ─── Nộp / làm lại ───
  const [busy, setBusy] = useState<'submit' | 'retry' | null>(null);

  const submit = async () => {
    flushDrafts(false);
    setBusy('submit');
    try {
      const saved = (
        await api.post<{ data: Pick<TvstBizAssignmentData, 'submitted_at' | 'result' | 'unit' | 'sections'> }>(
          `/assignments/${assignmentId}/tvst-business/submit`,
          { answers: answersRef.current },
        )
      ).data.data;
      if (saved) {
        setSubmittedView(saved);
        answersRef.current = answersFromSections(saved.sections);
        setAnswers(answersRef.current);
        showToast('success', 'Đã nộp bài', `Bạn được ${saved.result?.score ?? 0}/${saved.result?.max_score ?? 10} điểm`);
      }
      void AsyncStorage.removeItem(storageKey(assignmentId)).catch(() => undefined);
      setSaveStatus('idle');
      void qc.invalidateQueries({ queryKey: ['assignments'] });
    } catch (err) {
      showToast('error', 'Nộp bài không thành công', getErrorMessage(err, 'Thử lại nhé.'));
      // Đã nộp ở máy khác → tải lại để hiện kết quả. 503 = AI chấm câu dịch đang bận: bài đã lưu, bấm nộp lại.
      if ((err as { response?: { status?: number } })?.response?.status === 409) void query.refetch();
    } finally {
      setBusy(null);
    }
  };

  const retry = async () => {
    setBusy('retry');
    try {
      await api.post(`/assignments/${assignmentId}/tvst-business/retry`);
      flushDrafts(false);
      setSubmittedView(null);
      answersRef.current = EMPTY;
      setAnswers(EMPTY);
      void AsyncStorage.removeItem(storageKey(assignmentId)).catch(() => undefined);
      setSaveStatus('idle');
      setStep(4);
      seededFor.current = null;
      await query.refetch();
      void qc.invalidateQueries({ queryKey: ['assignments'] });
    } catch (err) {
      showToast('error', 'Chưa mở lại được bài', getErrorMessage(err, 'Thử lại nhé.'));
    } finally {
      setBusy(null);
    }
  };

  const confirmSubmit = () =>
    sheet.confirm({
      title: 'Nộp bài tập?',
      message:
        totalFilled < totalItems
          ? `Bạn còn ${totalItems - totalFilled}/${totalItems} ô chưa làm — ô bỏ trống tính sai. Hệ thống chấm ngay trên thang ${view?.max_score ?? 10}; muốn cải thiện điểm thì bấm Làm lại bài sau khi nộp.`
          : `Hệ thống chấm ngay trên thang ${view?.max_score ?? 10}. Nộp xong bạn vẫn làm lại được — điểm lần nộp mới nhất sẽ được ghi nhận.`,
      label: 'Nộp bài',
      danger: false,
      cancelLabel: 'Làm tiếp',
      onConfirm: () => void submit(),
    });

  const confirmRetry = () =>
    sheet.confirm({
      title: 'Làm lại bài?',
      message: 'Bài làm sẽ được xoá trắng để bạn làm lại từ đầu. Điểm hiện tại vẫn giữ tới khi bạn nộp lần mới.',
      label: 'Làm lại',
      danger: false,
      onConfirm: () => void retry(),
    });

  if (query.isLoading) return <ActivityIndicator className="py-16" />;
  if (query.isError || !view || !unit) {
    const lock = classLockOf(query.error);
    if (lock) return <ClassLockedView reason={lock.reason} />;
    return (
      <StateView
        icon="cloud-offline-outline"
        title="Không tải được bài tập"
        description={getErrorMessage(query.error)}
        actionLabel="Thử lại"
        onAction={() => query.refetch()}
      />
    );
  }

  const changeStep = (next: TvstStep) => {
    audio.stop();
    setStep(next);
  };
  const nextStep = steps[steps.indexOf(activeStep) + 1];

  return (
    <View className="gap-3">
      {/* Đầu bài gọn (anh báo 06/11/2026): tên bài + 1 dòng phụ thay cho hàng chip, điểm gộp vào cùng khối */}
      <View className="gap-2.5 rounded-2xl bg-brand-soft p-3">
        <View className="gap-0.5 px-1">
          <Text className="text-[11px] font-black uppercase tracking-wide text-brand">Bài tập · Từ Vựng Siêu Tốc đi làm</Text>
          <Text className="text-[15px] font-bold leading-5 text-foreground">
            {unit.unit} · {unit.title}
          </Text>
          <Text className="text-[12px] text-muted" numberOfLines={1}>
            {unit.title_vi ? `${unit.title_vi} · ` : ''}Không hạn nộp · Tự chấm thang {view.max_score}
          </Text>
        </View>
        {isReviewer ? (
          <View className="flex-row">
            <Chip text={submitted ? 'Học viên đã nộp' : 'Học viên chưa nộp — đang xem bản nháp'} tone={submitted ? 'success' : 'warning'} />
          </View>
        ) : null}
        {result ? (
          <ScoreCard result={result} submittedAt={view.submitted_at} attempts={view.attempts} onRetry={isReviewer ? undefined : confirmRetry} retrying={busy === 'retry'} />
        ) : null}
        {/* 3 ô chia đều 1 hàng, mỗi ô 2 dòng (STEP n · số câu / tên) — đã nộp thì số là câu đúng, thay cho ô điểm từng phần */}
        <View className="flex-row gap-1.5">
          {steps.map((s) => {
            const active = s === activeStep;
            const count = result ? `${result.steps.find((x) => x.step === s)?.correct ?? 0}/${stepTotals[s]}` : `${Math.min(stepFilled[s], stepTotals[s])}/${stepTotals[s]}`;
            return (
              <Pressable
                key={s}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => changeStep(s)}
                className={`flex-1 items-center rounded-xl border px-1 py-1.5 active:opacity-80 ${active ? 'border-brand bg-brand' : 'border-border bg-surface'}`}>
                <Text className={`text-[10.5px] font-black ${active ? 'text-on-brand' : 'text-muted'}`}>
                  STEP {s} · {count}
                </Text>
                <Text className={`text-[12.5px] font-bold ${active ? 'text-on-brand' : 'text-foreground'}`} numberOfLines={1}>
                  {STEP_LABELS[s]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {view.redo && !submitted ? (
        <Notice tone="warning">
          {isReviewer ? 'Đã yêu cầu học viên làm lại.' : 'Giáo viên cho bạn làm lại bài này.'}
          {view.redo.reason ? ` Lý do: ${view.redo.reason}` : ''}
          {!isReviewer ? ' Bài làm cũ vẫn giữ nguyên để bạn sửa, nộp lại là chấm điểm mới.' : ''}
        </Notice>
      ) : null}
      {!isReviewer && !submitted && view.previous ? (
        <Notice tone="info">
          Bạn đang làm lại lần {(view.attempts || 1) + 1}. Điểm đang ghi nhận: {view.previous.score}/{view.previous.max_score} — nộp lần này thì điểm mới sẽ thay điểm cũ.
        </Notice>
      ) : null}
      {isReviewer && view.retrying ? (
        <Notice tone="info">Học viên đang làm lại lần mới — bên dưới là bài của lần nộp gần nhất (đúng với điểm đang ghi nhận).</Notice>
      ) : null}

      {!readOnly && view.description ? <Text className="px-1 text-[13px] leading-5 text-muted">{view.description}</Text> : null}

      {activeStep === 4 ? (
        <View className="gap-5">
          <CodeSwitchExam
            id="a"
            title="A. Chêm tiếng Anh trong đoạn tiếng Việt"
            hint="Bấm loa để nghe nghĩa tiếng Việt — gõ cụm tiếng Anh tương ứng."
            paragraphs={unit.codeswitch.vi_en}
            answers={answers.codeswitch_a}
            results={result?.items.codeswitch_a}
            near={result?.near?.codeswitch_a}
            readOnly={readOnly}
            audio={audio}
            onChange={(k, v) => updateAnswer('codeswitch_a', k, v)}
          />
          <CodeSwitchExam
            id="b"
            title="B. Chêm tiếng Việt trong đoạn tiếng Anh"
            hint="Đọc bài tiếng Anh, bấm loa nghe nghĩa tiếng Việt — gõ lại cụm tiếng Anh."
            paragraphs={unit.codeswitch.en_vi}
            answers={answers.codeswitch_b}
            results={result?.items.codeswitch_b}
            near={result?.near?.codeswitch_b}
            readOnly={readOnly}
            audio={audio}
            onChange={(k, v) => updateAnswer('codeswitch_b', k, v)}
          />
        </View>
      ) : null}
      {activeStep === 5 ? (
        <TranslateExam
          items={unit.translation}
          answers={answers.translation}
          results={result?.items.translation}
          notes={result?.notes?.translation}
          readOnly={readOnly}
          audio={audio}
          onChange={(k, v) => updateAnswer('translation', k, v)}
        />
      ) : null}
      {activeStep === 6 ? (
        <GapFillExam
          items={unit.gapfill}
          bank={unit.gapfill_bank || []}
          answers={answers.gapfill}
          results={result?.items.gapfill}
          near={result?.near?.gapfill}
          readOnly={readOnly}
          audio={audio}
          onChange={(k, v) => updateAnswer('gapfill', k, v)}
        />
      ) : null}

      {nextStep ? <Button title={`Sang STEP ${nextStep} · ${STEP_LABELS[nextStep]}`} variant="secondary" icon="arrow-forward" onPress={() => changeStep(nextStep)} /> : null}

      {!readOnly ? (
        <View className="gap-2 rounded-2xl bg-surface p-3">
          <View className="flex-row items-center gap-2">
            <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
              <View className="h-full rounded-full bg-brand" style={{ width: `${totalItems ? (totalFilled / totalItems) * 100 : 0}%` }} />
            </View>
            <Text className="text-[12px] font-semibold text-muted">
              {totalFilled}/{totalItems} ô
            </Text>
          </View>
          <View className="flex-row items-center gap-3">
            <Text className={`flex-1 text-[12px] ${saveStatus === 'error' ? 'text-danger' : 'text-muted'}`}>
              {saveStatus === 'saving' ? 'Đang lưu…' : saveStatus === 'saved' ? 'Đã lưu nháp' : saveStatus === 'error' ? 'Chưa lưu được — kiểm tra mạng' : ''}
            </Text>
            <Button
              title={busy === 'submit' ? 'Đang chấm bài…' : 'Nộp bài'}
              icon="send"
              loading={busy === 'submit'}
              disabled={busy !== null || totalFilled === 0}
              onPress={confirmSubmit}
              className="h-11 px-5"
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ─── Phần chung ─────────────────────────────────────────────────────────────

function ScoreCard({
  result,
  submittedAt,
  attempts,
  onRetry,
  retrying,
}: {
  result: NonNullable<TvstBizAssignmentData['result']>;
  submittedAt: string | null;
  attempts?: number;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const pct = result.max_score ? result.score / result.max_score : 0;
  const tone = pct >= 0.8 ? 'success' : pct >= 0.5 ? 'warning' : 'danger';
  // 1 hàng gọn trong khối đầu bài: điểm · giờ nộp · nút Làm lại. Bỏ đoạn giải thích cách tính điểm và các ô
  // điểm từng step (tab STEP ngay dưới đã ghi số câu đúng) — anh báo 06/11/2026.
  return (
    <View className="flex-row items-center gap-3 rounded-xl bg-surface px-3 py-2">
      <Text className={`text-[26px] font-black ${tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-danger'}`}>
        {result.score}
        <Text className="text-[13px] font-bold text-muted"> /{result.max_score}</Text>
      </Text>
      <View className="flex-1">
        <Text className="text-[13px] font-bold text-foreground">Điểm của bạn</Text>
        <Text className="text-[11.5px] text-muted" numberOfLines={1}>
          Nộp {formatDateTime(submittedAt)}
          {attempts && attempts > 1 ? ` · lần ${attempts}` : ''}
        </Text>
      </View>
      {onRetry ? <Button title="Làm lại" icon="refresh" variant="secondary" loading={retrying} onPress={onRetry} className="h-9 px-3" /> : null}
    </View>
  );
}

function Chip({ text, tone }: { text: string; tone?: 'success' | 'warning' }) {
  return (
    <View className={`rounded-full px-2.5 py-1 ${tone === 'success' ? 'bg-success-soft' : tone === 'warning' ? 'bg-warning-soft' : 'bg-surface'}`}>
      <Text className={`text-[11.5px] font-semibold ${tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-muted'}`}>{text}</Text>
    </View>
  );
}

function Notice({ tone, children }: { tone: 'warning' | 'info'; children: ReactNode }) {
  return (
    <View className={`rounded-2xl px-4 py-3 ${tone === 'warning' ? 'bg-warning-soft' : 'bg-info-soft'}`}>
      <Text className="text-[13px] leading-5 text-foreground">{children}</Text>
    </View>
  );
}
