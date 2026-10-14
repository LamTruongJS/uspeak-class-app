import { useInfiniteQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { sessionLabel } from '@/features/assignments/assignment-card';
import { deadlineUrgency, type GradingQueueItem } from '@/features/assignments/grading-api';
import { GroupedList, ListToolbar, SubmissionRow, type Tone } from '@/features/assignments/staff-list';
import { api } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';

interface ReviewQueuePage {
  data: GradingQueueItem[];
  total: number;
  pagination: { page: number; totalPages: number; hasNextPage: boolean };
}

/**
 * Review bài nhận xét — hàng chờ duyệt (GET /assignments/review-queue, cùng kiểu dữ liệu hàng chờ nhận xét,
 * bài nộp sớm nhất lên trước). Chia 2 nhóm: **Gấp** (hạn nhận xét < 12 giờ / đã quá) và **Chờ duyệt**.
 * Bấm → màn review trong app (grading/review/[id]).
 */
export default function GradingReviewsScreen() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [now] = useState(() => Date.now());
  const { data: token } = useMediaToken();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = useInfiniteQuery({
    queryKey: ['grading', 'review-queue', debounced],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<ReviewQueuePage>('/assignments/review-queue', {
          params: { page: pageParam, limit: 20, search: debounced || undefined, sort_by: 'submitted_at', sort_order: 'asc' },
        })
      ).data,
    getNextPageParam: (last) => (last.pagination?.hasNextPage ? last.pagination.page + 1 : undefined),
  });

  const pull = usePullRefresh(() => query.refetch());
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.data) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;
  const sections = useMemo(() => {
    const urgent = items.filter((i) => deadlineUrgency(i.grading_deadline, now) !== 'normal');
    const rest = items.filter((i) => deadlineUrgency(i.grading_deadline, now) === 'normal');
    return [...(urgent.length ? [{ title: 'Gấp', data: urgent }] : []), ...(rest.length ? [{ title: 'Chờ duyệt', data: rest }] : [])];
  }, [items, now]);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Review bài nhận xét' }} />
      <GroupedList
        sections={sections}
        keyOf={(i) => i._id}
        query={query}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        empty={{ icon: 'checkmark-done-outline', title: debounced ? 'Không tìm thấy bài' : 'Không có bài nào chờ duyệt' }}
        header={
          <ListToolbar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="Tìm học viên / bài tập / lớp…"
            summary={query.data ? `${total.toLocaleString('vi-VN')} bài đang chờ duyệt nhận xét` : undefined}
          />
        }
        renderItem={(item) => {
          const urgency = deadlineUrgency(item.grading_deadline, now);
          const pills: { text: string; tone: Tone }[] = [
            ...(urgency === 'overdue' ? [{ text: 'Quá hạn nhận xét', tone: 'danger' as const }] : []),
            ...(urgency === 'urgent' ? [{ text: 'Sắp hết hạn', tone: 'warning' as const }] : []),
            ...(item.is_late ? [{ text: 'Nộp trễ', tone: 'warning' as const }] : []),
            ...(item.attempt_number > 1 ? [{ text: `Lần ${item.attempt_number}`, tone: 'violet' as const }] : []),
            ...(item.grader_name ? [{ text: `NX: ${item.grader_name}`, tone: 'info' as const }] : []),
          ];
          return (
            <SubmissionRow
              studentName={item.student_name}
              studentAvatar={item.student_avatar}
              token={token?.media_token}
              title={item.assignment_title}
              meta={[item.class_code || item.class_name, sessionLabel(item.session_number)].filter(Boolean).join(' · ')}
              pills={pills}
              footer={
                item.grading_deadline ? `Hạn NX ${formatDateTime(item.grading_deadline)}` : `Nộp ${formatDateTime(item.submitted_at)}`
              }
              onPress={() => router.push({ pathname: '/grading/review/[id]', params: { id: item._id } })}
            />
          );
        }}
      />
    </View>
  );
}
