import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { StateView } from '@/components/ui/state-view';
import { showToast } from '@/components/ui/toast';
import { ClassLockedView, classLockOf } from '@/features/classes/class-locked';
import { DictationLessonView } from '@/features/dictation/dictation-lesson';
import { LEVEL_LABEL, type DictationLesson, type DictationLevel, type DictationProgress, type DictationSavePayload } from '@/features/dictation/types';
import { api, getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';

/**
 * Bài tập Speak Your Mind (`assignment_type.code = 'sym'`) — bản mobile của
 * class-fe my-assignments/[id]/submit/AssignmentSymPractice.tsx. Học viên làm 1 bài nghe chép chính
 * tả như E-Learning; KHÔNG có nút nộp: làm xong cả bài với tỉ lệ đúng TRÊN `pass_score` là hoàn thành.
 * Không bao giờ mở /result cho loại bài này (không có bài nộp để xem).
 */
interface SymPracticeData {
  assignment_id: string;
  title: string;
  submission_deadline: string | null;
  allow_late_submission: boolean;
  pass_score: number;
  level: DictationLevel | null;
  hint_limit: number;
  lesson: DictationLesson;
  progress: DictationProgress | null;
}

export function SymAssignment({ assignmentId }: { assignmentId: string }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['assignments', 'sym-practice', assignmentId],
    queryFn: async () => (await api.get<{ data: SymPracticeData }>(`/assignments/${assignmentId}/sym`)).data.data,
  });
  const data = query.data;

  /** Bài làm mới nhất — cập nhật theo từng lần lưu để dòng "cao nhất" chạy theo */
  const [savedProgress, setProgress] = useState<DictationProgress | null>(null);
  const progress = savedProgress ?? data?.progress ?? null;
  const [now] = useState(() => Date.now());

  const save = useCallback(
    async (payload: DictationSavePayload) => {
      const wasCompleted = !!progress?.completed_at;
      const saved = (await api.put<{ data: DictationProgress }>(`/assignments/${assignmentId}/sym/progress`, payload)).data.data ?? null;
      if (saved) setProgress(saved);
      // Danh sách bài / trang chủ hiện % trên thẻ — cho tải lại khi quay ra.
      if (payload.finish || payload.reset) void qc.invalidateQueries({ queryKey: ['assignments'] });
      if (payload.finish && !wasCompleted && saved) {
        if (saved.completed_at) showToast('success', 'Bạn đã đạt yêu cầu', 'Bài tập đã hoàn thành!');
        else showToast('error', `Lần này đúng ${saved.score}%`, `Cần trên ${data?.pass_score ?? 70}% mới hoàn thành. Làm lại nhé!`);
      }
      return saved;
    },
    [assignmentId, progress?.completed_at, qc, data?.pass_score],
  );

  if (query.isLoading) return <ActivityIndicator className="py-16" />;
  if (query.isError || !data) {
    const lock = classLockOf(query.error);
    if (lock) return <ClassLockedView reason={lock.reason} />;
    return (
      <StateView
        icon="cloud-offline-outline"
        title="Không tải được bài Speak Your Mind"
        description={getErrorMessage(query.error)}
        actionLabel="Thử lại"
        onAction={() => query.refetch()}
      />
    );
  }

  const { lesson } = data;
  const completed = !!progress?.completed_at;
  const deadline = data.submission_deadline ? new Date(data.submission_deadline) : null;
  const overdue = !completed && !!deadline && deadline.getTime() < now;
  const closed = overdue && !data.allow_late_submission;
  const isLate = completed && !!deadline && new Date(progress!.completed_at as string) > deadline;

  const header = (
    <View className="gap-1.5">
      <Text className="text-[11px] font-black uppercase tracking-wide text-brand">Speak Your Mind</Text>
      <Text className="text-[17px] font-bold text-foreground">{data.title}</Text>
      <View className="flex-row flex-wrap gap-1.5">
        <Chip text={`Hạn: ${deadline ? formatDateTime(deadline) : '—'}`} danger={overdue} />
        {completed ? <Chip text={`Cao nhất ${progress?.best_score ?? 0}% · ${progress?.attempts ?? 0} lần`} /> : null}
      </View>
    </View>
  );

  const notice =
    completed || overdue ? (
      <View className={`rounded-2xl px-4 py-3 ${completed ? (isLate ? 'bg-warning-soft' : 'bg-success-soft') : closed ? 'bg-surface-muted' : 'bg-danger-soft'}`}>
        <Text className="text-[13px] leading-5 text-foreground">
          {completed
            ? `Đã hoàn thành lúc ${formatDateTime(new Date(progress!.completed_at as string))}${isLate ? ' (nộp trễ)' : ''}. Làm lại để luyện thêm không đổi kết quả.`
            : closed
              ? 'Đã quá hạn nộp — bài không cho nộp muộn nên không làm tiếp được nữa.'
              : 'Đã quá hạn nộp — hoàn thành bây giờ sẽ được ghi nhận là nộp trễ.'}
        </Text>
      </View>
    ) : (
      <Text className="px-1 text-[12px] leading-5 text-muted">
        Bài được tính hoàn thành khi bạn làm xong cả {lesson.sentences.length} câu với tỉ lệ đúng trên {data.pass_score}%
        {data.level ? ` ở mức ${LEVEL_LABEL[data.level]} giáo viên đã giao.` : ' (chọn mức Dễ, Vừa hay Khó đều được).'}
        {progress?.attempts ? ` Cao nhất hiện tại ${progress.best_score}%.` : ''}
      </Text>
    );

  // Quá hạn + không cho nộp muộn: chỉ hiện thông tin, không mở bài làm (như web).
  if (closed) {
    return (
      <View className="gap-3">
        <View className="rounded-2xl bg-brand-soft px-4 py-3">{header}</View>
        {notice}
      </View>
    );
  }

  return (
    <DictationLessonView
      key={lesson.unit}
      lesson={lesson}
      progress={data.progress}
      onSave={save}
      header={header}
      notice={notice}
      passScore={data.pass_score}
      lockedLevel={data.level}
      hintLimit={data.hint_limit ?? 3}
    />
  );
}

function Chip({ text, danger }: { text: string; danger?: boolean }) {
  return (
    <View className={`rounded-full px-2.5 py-1 ${danger ? 'bg-danger-soft' : 'bg-surface'}`}>
      <Text className={`text-[11.5px] font-semibold ${danger ? 'text-danger' : 'text-muted'}`}>{text}</Text>
    </View>
  );
}
