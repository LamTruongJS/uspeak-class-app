import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { sessionLabel } from '@/features/assignments/assignment-card';
import {
  formatGradingTime,
  GRADING_HISTORY_FILTERS,
  useMyGradingHistory,
  type GradingHistoryItem,
} from '@/features/assignments/requests-api';
import { GroupedList, groupByDay, ListToolbar, SubmissionRow, timeOf, type Tone } from '@/features/assignments/staff-list';
import { useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';

const STATUS_VIEW: Record<string, { text: string; tone: Tone }> = {
  graded: { text: 'Đã nhận xét', tone: 'success' },
  in_progress: { text: 'Đang nhận xét', tone: 'info' },
  left: { text: 'Đã rời bài', tone: 'neutral' },
};

/**
 * Lịch sử nhận xét của tôi (web /assignments/my-history) — nhóm theo ngày chấm. Bấm 1 bài: đang chấm dở →
 * màn chấm; đang chờ nhận xét lại → màn nhận xét lại; còn lại → xem kết quả (đều trong app).
 */
export default function GradingHistoryScreen() {
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [now] = useState(() => Date.now());
  const { data: token } = useMediaToken();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMyGradingHistory({ status, search: debounced });
  const pull = usePullRefresh(() => query.refetch());
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  const total = query.data?.pages[0]?.pagination?.total ?? 0;
  const sections = useMemo(() => groupByDay(items, (i) => i.graded_at ?? i.submitted_at, now), [items, now]);

  const open = (item: GradingHistoryItem) =>
    item.status === 'claimed' && item.my_grading_status === 'in_progress'
      ? router.push({ pathname: '/grading/[id]', params: { id: item._id } })
      : item.status === 'regrade_requested'
        ? router.push({ pathname: '/grading/regrade/[id]', params: { id: item._id } })
        : router.push({ pathname: '/result/[id]', params: { id: item._id, staff: '1' } });

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Lịch sử nhận xét' }} />
      <GroupedList
        sections={sections}
        keyOf={(i) => i._id}
        query={query}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        empty={{ icon: 'time-outline', title: debounced ? 'Không tìm thấy bài' : 'Chưa có bài nào trong lịch sử' }}
        header={
          <ListToolbar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Tìm học viên / bài tập…"
            filters={GRADING_HISTORY_FILTERS}
            filter={status}
            onFilter={setStatus}
            summary={query.data ? `${total.toLocaleString('vi-VN')} bài` : undefined}
          />
        }
        renderItem={(item) => (
          <SubmissionRow
            studentName={item.student_name}
            token={token?.media_token}
            title={item.assignment_title}
            meta={[item.class_name, sessionLabel(item.session_number)].filter(Boolean).join(' · ')}
            pills={[
              STATUS_VIEW[item.my_grading_status] ?? STATUS_VIEW.left,
              ...(item.attempt_number > 1 ? [{ text: `Lần ${item.attempt_number}`, tone: 'violet' as const }] : []),
              ...(item.grading_time_seconds
                ? [{ text: `Mất ${formatGradingTime(item.grading_time_seconds)}`, tone: 'neutral' as const }]
                : []),
            ]}
            footer={item.graded_at ? `Chấm ${timeOf(item.graded_at)}` : `Nộp ${timeOf(item.submitted_at)}`}
            onPress={() => open(item)}
          />
        )}
      />
    </View>
  );
}
