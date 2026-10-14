import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { sessionLabel } from '@/features/assignments/assignment-card';
import { REQUEST_STATUS_FILTERS, useMyRedoRequests } from '@/features/assignments/requests-api';
import { GroupedList, groupByDay, ListToolbar, SubmissionRow, timeOf, type Tone } from '@/features/assignments/staff-list';
import { formatDateTime } from '@/lib/format';
import { useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';

type Tab = 'student' | 'requester';

/**
 * Bài yêu cầu làm lại (web /assignments/redo-requests), giữ 2 phía như web: "Tôi đã yêu cầu" (role=requester) và
 * "Tôi phải làm lại" (role=student — ai cũng nộp bài nên ai cũng có thể bị yêu cầu). Nhóm theo ngày yêu cầu.
 * Bài đã nộp lại → mở bài MỚI (giống web).
 */
export default function RedoRequestsScreen() {
  const [tab, setTab] = useState<Tab>('requester');
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
      <Stack.Screen options={{ title: 'Bài yêu cầu làm lại' }} />
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
              { value: 'requester', label: 'Tôi đã yêu cầu' },
              { value: 'student', label: 'Tôi phải làm lại' },
            ]}
            tab={tab}
            onTab={(v) => {
              setTab(v);
              setStatus('all');
            }}
            filters={REQUEST_STATUS_FILTERS}
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
              // Tab 'Tôi phải làm lại' = bài của CHÍNH MÌNH → kết quả học viên; tab 'Tôi đã yêu cầu' → xem như người chấm
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
