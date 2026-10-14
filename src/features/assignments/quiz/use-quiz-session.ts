import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { getErrorMessage } from '@/lib/api/client';
import { UploadError } from '@/lib/api/upload';

import {
  extractSubmissionId,
  invalidateAfterSubmit,
  submitApi,
  type AssignmentDetail,
  type QuizAnswer,
  type QuizQuestion,
  type QuizResult,
} from '../detail-api';

/**
 * Phiên làm quiz — port logic từ uspeak-class-fe AssignmentQuizSubmit.tsx, giữ các luật
 * đã phải trả giá mới có bên web:
 *
 * 1. Bản thu mỗi câu nói upload NGAY khi thu xong (tránh 413 khi nộp cả cục) và chấm luôn.
 * 2. Trước khi nộp phải CHỜ hết upload đang bay — nộp sớm thì payload thiếu audioKey,
 *    BE ghi NO_AUDIO = 0 điểm câu đó.
 * 3. audioKey đọc từ ref, không đọc state (state trong closure có thể cũ → mất audioKey).
 * 4. Upload lỗi 429 = BE đã lưu S3 rồi mới chặn → KHÔNG coi là mất bản thu.
 * 5. Đồng hồ do server giữ (started_at): lưu nháp mỗi 10s, lệch > 3s thì theo số của server.
 *    Ở app, đồng hồ chạy theo giờ thật (endAt) nên ra nền/khoá máy vẫn trừ đúng.
 * 6. Hết giờ → tự nộp phần đã làm (allowPartial).
 */

export interface SpeakingState {
  /** File ghi âm trên máy (để nghe lại) */
  localUri?: string;
  uploading?: boolean;
  /** Upload hỏng (không phải 429) → nộp là mất điểm câu này */
  failed?: boolean;
  assessment?: QuizResult | null;
}

export function useQuizSession(assignment: AssignmentDetail) {
  const questions = useMemo<QuizQuestion[]>(() => assignment.quiz_questions ?? [], [assignment.quiz_questions]);
  const durationSeconds = Number(assignment.required_duration_minutes || 0) * 60;

  // ── Nạp lại nháp (rớt mạng / thoát app giữa chừng) ──
  const draft = assignment.quiz_draft;
  const [selected, setSelected] = useState<Record<string, string[]>>(() =>
    Object.fromEntries((draft?.answers ?? []).filter((a) => a.selectedKeys?.length).map((a) => [a.questionKey, a.selectedKeys!])),
  );
  const draftAudioKeys = (): Record<string, string> =>
    Object.fromEntries((draft?.answers ?? []).filter((a) => a.audioKey).map((a) => [a.questionKey, a.audioKey!]));
  const [audioKeys, setAudioKeys] = useState<Record<string, string>>(draftAudioKeys);
  // Bản ref của audioKeys — payload nộp bài đọc từ đây (luật 3 ở trên)
  const audioKeysRef = useRef<Record<string, string>>(audioKeys);
  const [savedAudioUrls] = useState<Record<string, string>>(() =>
    Object.fromEntries((draft?.answers ?? []).filter((a) => a.audioUrl).map((a) => [a.questionKey, a.audioUrl!])),
  );
  const [speaking, setSpeaking] = useState<Record<string, SpeakingState>>({});
  const pendingUploads = useRef(new Map<string, Promise<void>>());
  const [notice, setNotice] = useState<string | null>(null);

  // ── Bắt đầu + đồng hồ ──
  const [started, setStarted] = useState(false);
  const initialRemaining = Math.max(0, Number(draft?.remaining_seconds || durationSeconds));
  const timed = initialRemaining > 0;
  const endAtRef = useRef(0);
  const [remaining, setRemaining] = useState(initialRemaining);
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [timeExpired, setTimeExpired] = useState(false);
  const submittedRef = useRef(false);

  const start = useCallback(() => {
    endAtRef.current = Date.now() + initialRemaining * 1000;
    setStarted(true);
  }, [initialRemaining]);

  // ── Trả lời ──
  const toggleChoice = useCallback((q: QuizQuestion, optionKey: string) => {
    setSelected((prev) => {
      const current = prev[q.key] ?? [];
      const single = q.type === 'single_choice' || q.type === 'listening';
      const next = single
        ? [optionKey]
        : current.includes(optionKey)
          ? current.filter((k) => k !== optionKey)
          : [...current, optionKey];
      return { ...prev, [q.key]: next };
    });
  }, []);

  const hasSpeakingAnswer = useCallback(
    (key: string) => Boolean(audioKeys[key] || speaking[key]?.localUri || savedAudioUrls[key]),
    [audioKeys, speaking, savedAudioUrls],
  );

  const isAnswered = useCallback(
    (q: QuizQuestion) => (q.type === 'speaking' ? hasSpeakingAnswer(q.key) : (selected[q.key] ?? []).length > 0),
    [hasSpeakingAnswer, selected],
  );

  const missing = useMemo(() => questions.filter((q) => !isAnswered(q)), [questions, isAnswered]);

  /** Upload bản thu 1 câu — không bao giờ throw, lỗi hiện ra `notice`. */
  const uploadRecording = useCallback(
    (questionKey: string, uri: string) => {
      setSpeaking((s) => ({ ...s, [questionKey]: { localUri: uri, uploading: true, failed: false, assessment: null } }));
      setNotice(null);
      const task = (async () => {
        try {
          const res = await submitApi.speaking(assignment._id, questionKey, uri);
          const data = res.data;
          if (data?.audioKey) {
            audioKeysRef.current = { ...audioKeysRef.current, [questionKey]: data.audioKey };
            setAudioKeys(audioKeysRef.current);
          }
          setSpeaking((s) => ({ ...s, [questionKey]: { ...s[questionKey], uploading: false, assessment: data?.assessment ?? null } }));
        } catch (err) {
          const status = err instanceof UploadError ? err.status : 0;
          const data = err instanceof UploadError ? err.data : {};
          if (status === 429) {
            setSpeaking((s) => ({ ...s, [questionKey]: { ...s[questionKey], uploading: false } }));
            setNotice(
              data.code === 'RATE_LIMIT_PER_MIN'
                ? `Thu lại quá nhanh, đợi ${String(data.retryAfter ?? 'vài')} giây rồi thử lại.`
                : `Đã hết lượt chấm cho câu này (${String(data.totalUsed ?? '?')}/${String(data.totalLimit ?? '?')}). Điểm giữ theo lần chấm gần nhất.`,
            );
          } else {
            setSpeaking((s) => ({ ...s, [questionKey]: { ...s[questionKey], uploading: false, failed: true } }));
            setNotice(err instanceof Error ? err.message : 'Lưu bản thu thất bại, vui lòng thu lại.');
          }
        }
      })();
      pendingUploads.current.set(questionKey, task);
      void task.finally(() => {
        if (pendingUploads.current.get(questionKey) === task) pendingUploads.current.delete(questionKey);
      });
    },
    [assignment._id],
  );

  const uploadingCount = Object.values(speaking).filter((s) => s.uploading).length;

  const buildAnswers = useCallback(
    (): QuizAnswer[] =>
      questions.map((q) => ({
        questionKey: q.key,
        selectedKeys: selected[q.key] ?? [],
        audioKey: audioKeysRef.current[q.key],
      })),
    [questions, selected],
  );

  // ── Nộp bài ──
  const submit = useCallback(
    async (allowPartial: boolean): Promise<string | null> => {
      if (submittedRef.current) return submittedId;
      setSubmitting(true);
      setNotice(null);
      try {
        await Promise.allSettled([...pendingUploads.current.values()]);
        if (!allowPartial) {
          const lost = questions.filter(
            (q) => q.type === 'speaking' && speaking[q.key]?.failed && !audioKeysRef.current[q.key],
          );
          if (lost.length) {
            throw new Error(`Có ${lost.length} bản thu chưa lưu được lên hệ thống. Vui lòng thu lại câu đó rồi nộp.`);
          }
        }
        const res = await submitApi.quiz(assignment._id, buildAnswers());
        submittedRef.current = true;
        const id = extractSubmissionId(res.data);
        setSubmittedId(id);
        invalidateAfterSubmit(assignment._id);
        return id;
      } catch (err) {
        setNotice(err instanceof Error && !('response' in err) ? err.message : getErrorMessage(err, 'Không thể nộp bài.'));
        return null;
      } finally {
        setSubmitting(false);
      }
    },
    [assignment._id, buildAnswers, questions, speaking, submittedId],
  );

  // ── Lưu nháp + đồng bộ giờ với server ──
  const saveDraft = useCallback(async () => {
    if (!started || submittedRef.current) return;
    const left = timed ? Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000)) : 0;
    const res = await submitApi.quizHealthCheck(assignment._id, { answers: buildAnswers(), remaining_seconds: left }).catch(() => null);
    const d = res?.data?.data;
    if (timed && d?.server_timed && typeof d.remaining_seconds === 'number') {
      const server = Math.max(0, Math.floor(d.remaining_seconds));
      if (Math.abs(server - left) > 3) endAtRef.current = Date.now() + server * 1000;
    }
  }, [assignment._id, buildAnswers, started, timed]);

  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => void saveDraft(), 10_000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void saveDraft();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [saveDraft, started]);

  // Đồng hồ: tính theo giờ thật nên khoá máy / ra nền vẫn trừ đúng
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  useEffect(() => {
    if (!started || !timed || submittedId) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0 && !submittedRef.current) {
        clearInterval(t);
        setTimeExpired(true);
        void submitRef.current(true);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [started, timed, submittedId]);

  return {
    questions,
    started,
    start,
    timed,
    remaining,
    selected,
    toggleChoice,
    speaking,
    savedAudioUrls,
    uploadRecording,
    uploadingCount,
    isAnswered,
    missing,
    submit,
    submitting,
    submittedId,
    timeExpired,
    notice,
    setNotice,
    saveDraft,
  };
}

export type QuizSession = ReturnType<typeof useQuizSession>;
