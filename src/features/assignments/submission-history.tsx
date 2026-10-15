import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { StateView } from '@/components/ui/state-view';
import { getErrorMessage } from '@/lib/api/client';
import { useSubmissionHistory, type SubmissionHistoryEvent } from './grading-api';

const HISTORY_EVENT_UI: Record<
  string,
  { icon: ComponentProps<typeof Ionicons>['name']; box: string; color: string }
> = {
  submitted: { icon: 'document-text', box: 'bg-info-soft', color: '#2563eb' },
  claimed: { icon: 'person-add', box: 'bg-success-soft', color: '#059669' },
  graded: { icon: 'checkmark-circle', box: 'bg-violet-soft', color: '#7c3aed' },
  redo_requested: { icon: 'refresh', box: 'bg-warning-soft', color: '#d97706' },
  regrade_requested: { icon: 'alert-circle', box: 'bg-danger-soft', color: '#ea580c' },
  reassigned: { icon: 'swap-horizontal', box: 'bg-violet-soft', color: '#7c3aed' },
};

const historyDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

/** Timeline dùng chung cho màn nhận xét và màn kết quả, cùng dữ liệu với tab Lịch sử trên web. */
export function SubmissionHistoryTimeline({ submissionId }: { submissionId: string }) {
  const query = useSubmissionHistory(submissionId);
  const events = query.data?.events ?? [];

  if (query.isLoading) {
    return (
      <View className="items-center gap-2 rounded-3xl bg-surface py-10">
        <ActivityIndicator />
        <Text className="text-[13px] text-muted">Đang tải lịch sử...</Text>
      </View>
    );
  }
  if (query.isError) {
    return (
      <StateView
        icon="cloud-offline-outline"
        title="Không thể tải lịch sử nhận xét"
        description={getErrorMessage(query.error)}
        actionLabel="Thử lại"
        onAction={() => void query.refetch()}
      />
    );
  }
  if (!events.length) {
    return (
      <StateView
        icon="time-outline"
        title="Chưa có lịch sử nhận xét"
        description="Các hoạt động của bài nộp sẽ xuất hiện tại đây."
      />
    );
  }

  return (
    <View className="rounded-3xl bg-surface px-4 py-4">
      <View className="absolute bottom-6 left-[27px] top-6 w-px bg-border" />
      {events.map((event, index) => (
        <HistoryEventRow key={`${event.type}-${event.timestamp}-${index}`} event={event} last={index === events.length - 1} />
      ))}
    </View>
  );
}

function HistoryEventRow({ event, last }: { event: SubmissionHistoryEvent; last: boolean }) {
  const ui = HISTORY_EVENT_UI[event.type] ?? HISTORY_EVENT_UI.submitted;
  return (
    <View className="flex-row gap-3">
      <View className={`z-10 mt-0.5 h-6 w-6 items-center justify-center rounded-full ${ui.box}`}>
        <Ionicons name={ui.icon} size={13} color={ui.color} />
      </View>
      <View className={`min-w-0 flex-1 ${last ? 'pb-0' : 'pb-5'}`}>
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text className="text-[13.5px] font-bold text-foreground">{event.label}</Text>
          {event.type === 'graded' && event.score !== undefined ? (
            <View className="rounded-md bg-violet-soft px-1.5 py-0.5">
              <Text className="text-[11px] font-bold text-violet">
                {event.score}/{event.max_score ?? 10}
              </Text>
            </View>
          ) : null}
          {event.status === 'pending' ? <HistoryStatus label="Đang chờ" tone="warning" /> : null}
          {event.status === 'fulfilled' ? <HistoryStatus label="Đã xử lý" tone="success" /> : null}
        </View>
        <Text className="mt-0.5 text-[11.5px] text-muted">
          {historyDate(event.timestamp)}
          {event.user_name ? ` · ${event.user_name}` : ''}
        </Text>
        {event.details ? <HistoryDetail text={event.details} /> : null}
        {event.assigned_reason ? <HistoryDetail label="Lý do gửi người nhận mới" text={event.assigned_reason} /> : null}
        {event.previous_grader_reason ? <HistoryDetail label="Lý do ghi nhận lỗi" text={event.previous_grader_reason} /> : null}
        {event.type === 'graded' && event.text_feedback ? <HistoryDetail label="Nhận xét" text={event.text_feedback} /> : null}
        {event.type === 'regrade_requested' && event.assigned_to ? (
          <Text className="mt-1.5 text-[12px] text-warning">Giao cho: {event.assigned_to}</Text>
        ) : null}
      </View>
    </View>
  );
}

function HistoryStatus({ label, tone }: { label: string; tone: 'warning' | 'success' }) {
  return (
    <View className={`rounded-md px-1.5 py-0.5 ${tone === 'warning' ? 'bg-warning-soft' : 'bg-success-soft'}`}>
      <Text className={`text-[10px] font-bold uppercase ${tone === 'warning' ? 'text-warning' : 'text-success'}`}>{label}</Text>
    </View>
  );
}

function HistoryDetail({ label, text }: { label?: string; text: string }) {
  return (
    <View className="mt-1.5 rounded-xl border border-border bg-surface-muted px-3 py-2">
      <Text className="text-[12.5px] leading-[18px] text-foreground">
        {label ? <Text className="font-bold">{label}: </Text> : null}
        {text}
      </Text>
    </View>
  );
}
