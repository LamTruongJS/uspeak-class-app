import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { sessionLabel } from '@/features/assignments/assignment-card';
import { useMyRegradeRequests } from '@/features/assignments/requests-api';
import { GroupedList, groupByDay, ListToolbar, SubmissionRow, timeOf, type Tone } from '@/features/assignments/staff-list';
import { useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { menuScreenOptions } from '@/features/navigation/app-menu';

type Tab = 'assigned' | 'requester';

const REGRADE_STATUS_FILTERS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'pending', label: 'Chờ chấm lại' },
  { value: 'fulfilled', label: 'Đã chấm lại' },
];

/**
 * Nhận xét bài lại (web /assignments/regrades) — 2 phía: hàng đợi (role=assigned) và theo dõi (role=requester),
 * nhóm theo ngày yêu cầu. Bài đang chờ và mình được giao → màn
 * nhận xét lại trong app; còn lại → xem kết quả.
 */
export default function RegradesScreen() {
  const [tab, setTab] = useState<Tab>('assigned');
  const [status, setStatus] = useState('all');
  const [now] = useState(() => Date.now());
  const { data: token } = useMediaToken();

  const query = useMyRegradeRequests({ role: tab, status });
  const pull = usePullRefresh(() => query.refetch());
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  const total = query.data?.pages[0]?.pagination?.total ?? 0;
  const sections = useMemo(() => groupByDay(items, (i) => i.created_at, now), [items, now]);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Nhận xét bài lại', ...menuScreenOptions }} />
      <GroupedList
        key={tab}
        sections={sections}
        keyOf={(i) => i._id}
        query={query}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        empty={{
          icon: 'refresh-outline',
          title: tab === 'assigned' ? 'Không có bài nào cần nhận xét lại' : 'Bạn chưa yêu cầu ai nhận xét lại',
        }}
        header={
          <ListToolbar
            tabs={[
              { value: 'assigned', label: 'Hàng đợi chấm lại' },
              { value: 'requester', label: 'Theo dõi yêu cầu' },
            ]}
            tab={tab}
            onTab={(v) => {
              setTab(v);
              setStatus('all');
            }}
            filters={REGRADE_STATUS_FILTERS}
            filter={status}
            onFilter={setStatus}
            summary={query.data ? `${total.toLocaleString('vi-VN')} yêu cầu` : undefined}
          />
        }
        renderItem={(item) => {
          const done = item.request_status === 'fulfilled';
          const canRegrade = item.is_assigned_grader && item.submission_status === 'regrade_requested';
          const state: { text: string; tone: Tone } = done
            ? { text: 'Đã nhận xét lại', tone: 'success' }
            : { text: canRegrade ? 'Cần nhận xét lại' : 'Chờ nhận xét lại', tone: 'warning' };
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
                ...(typeof item.current_score === 'number' ? [{ text: `Điểm cũ ${item.current_score}`, tone: 'neutral' as const }] : []),
              ]}
              footer={
                tab === 'assigned'
                  ? `Từ ${item.requester_name || '—'} · ${timeOf(item.created_at)}`
                  : `Giao ${item.assigned_grader_name || '—'} · ${timeOf(item.created_at)}`
              }
              onPress={() =>
                canRegrade
                  ? router.push({ pathname: '/grading/regrade/[id]', params: { id: item.submission_id } })
                  : router.push({ pathname: '/result/[id]', params: { id: item.submission_id, staff: '1' } })
              }
            />
          );
        }}
      />
    </View>
  );
}
