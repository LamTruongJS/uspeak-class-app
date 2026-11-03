import type { SymAssignmentInfo } from './api';

/**
 * Nhãn + % cho bài Speak Your Mind ở các màn của học viên — chép luật `symActionState` của class-fe
 * (src/lib/sym-action.ts), sửa bên đó thì sửa theo ở đây.
 *
 * % = số câu đã làm / số câu (BE tính); chỉ 100% khi đã đạt. Quá hạn mà bài không cho nộp muộn
 * thì chỉ còn xem lại — nhưng VẪN mở được (khác bài thường bị khoá hẳn).
 */
export function symActionState(sym: SymAssignmentInfo, options: { submissionDeadline?: string | null; allowLateSubmission?: boolean } = {}) {
  const progress = sym.progress;
  const completed = progress?.status === 'completed';
  const deadlineMs = options.submissionDeadline ? new Date(options.submissionDeadline).getTime() : null;
  const closed = !completed && !options.allowLateSubmission && deadlineMs !== null && deadlineMs < Date.now();
  const percent = completed ? 100 : Math.max(0, Math.min(99, Math.round(progress?.percent || 0)));
  const started = !!progress;
  const needsRetry = !completed && !!progress?.needs_retry;

  const label = completed
    ? 'Xem lại (100%)'
    : needsRetry && !closed
      ? `Làm lại (cao nhất ${progress?.score ?? 0}%, cần >${sym.pass_score}%)`
      : closed
        ? `Xem lại (${percent}%)`
        : started
          ? `Tiếp tục làm (${percent}%)`
          : 'Làm bài';
  return { percent, label, completed, closed, started, needsRetry };
}
