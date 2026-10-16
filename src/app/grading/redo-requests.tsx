import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { sessionLabel } from '@/features/assignments/assignment-card';
import { useMyRedoRequests } from '@/features/assignments/requests-api';
import { GroupedList, groupByDay, ListToolbar, SubmissionRow, timeOf, type Tone } from '@/features/assignments/staff-list';
import { formatDateTime } from '@/lib/format';
import { useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { menuScreenOptions } from '@/features/navigation/app-menu';

type Tab = 'student' | 'requester';

const redoStatusFilters = (tab: Tab) => [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending', label: tab === 'student' ? 'Chưa nộp lại' : 'Đang chờ nộp lại' },
  { value: 'fulfilled', label: 'Đã nộp lại' },
];

/**
 * Bài yêu cầu làm lại (web /assignments/redo-requests), giữ 2 phía như web: hàng đợi (role=student) và
 * theo dõi (role=requester). Nhóm theo ngày yêu cầu.
 * Bài đã nộp lại → mở bài MỚI (giống web).
 */
export default function RedoRequestsScreen() {
  const [tab, setTab] = useState<Tab>('student');
  const [status, setStatus] = useState('all');
  const [now] = useState(() => Date.now());
  const { data: token } = useMediaToken();

  const query = useMyRedoRequests({ role: tab, status });
  const pull = usePullRefresh(() => query.refetch());
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  const total = query.data?.pages[0]?.pagination?.total ?? 0;
  const sections = useMemo(() => groupByDay(items, (i) => i.created_at, now), [items, now]);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Bài yêu cầu làm lại', ...menuScreenOptions }} />
      <GroupedList
        key={tab}
        sections={sections}
        keyOf={(i) => i._id}
        query={query}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        empty={{
          icon: 'return-down-back-outline',
          title: tab === 'student' ? 'Không có bài nào cần làm lại' : 'Bạn chưa yêu cầu ai làm lại bài',
        }}
        header={
          <ListToolbar
            tabs={[
              { value: 'student', label: 'Hàng đợi làm lại' },
              { value: 'requester', label: 'Theo dõi yêu cầu' },
            ]}
            tab={tab}
            onTab={(v) => {
              setTab(v);
              setStatus('all');
            }}
            filters={redoStatusFilters(tab)}
            filter={status}
            onFilter={setStatus}
            summary={query.data ? `${total.toLocaleString('vi-VN')} yêu cầu` : undefined}
          />
        }
        renderItem={(item) => {
          const done = item.request_status === 'fulfilled';
          const openId = item.has_resubmitted && item.resubmission ? item.resubmission._id : item.submission_id;
          const overdue = !done && !!item.redo_deadline && new Date(item.redo_deadline).getTime() < now;
          const state: { text: string; tone: Tone } = done
            ? { text: 'Đã xong', tone: 'success' }
            : { text: overdue ? 'Quá hạn làm lại' : 'Chờ làm lại', tone: overdue ? 'danger' : 'warning' };
          return (
            <SubmissionRow
              studentName={item.student_name}
              studentAvatar={item.student_avatar}
              token={token?.media_token}
              title={item.assignment_title}
              assignmentType={item.assignment_type}
              meta={[item.class_code || item.class_name, sessionLabel(item.session_number ?? undefined)].filter(Boolean).join(' · ')}
              note={item.reason ? { label: 'Lý do', text: item.reason } : null}
              pills={[
                state,
                ...(item.has_resubmitted ? [{ text: 'Đã nộp lại', tone: 'info' as const }] : []),
                ...(item.redo_deadline && !done ? [{ text: `Hạn ${formatDateTime(item.redo_deadline)}`, tone: 'neutral' as const }] : []),
              ]}
              footer={
                tab === 'student' && item.requester_name
                  ? `Từ ${item.requester_name} · ${timeOf(item.created_at)}`
                  : timeOf(item.created_at)
              }
              // Hàng đợi làm lại = bài của chính mình; theo dõi yêu cầu = xem với vai trò nhân viên.
              onPress={() =>
                router.push({ pathname: '/result/[id]', params: tab === 'requester' ? { id: openId, staff: '1' } : { id: openId } })
              }
            />
          );
        }}
      />
    </View>
  );
}
