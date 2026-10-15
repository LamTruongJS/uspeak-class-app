import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useActionSheet } from '@/components/ui/action-sheet';
import { StateView } from '@/components/ui/state-view';
import { useClassAssignments } from '@/features/assignments/class-api';
import { SUBMISSION_STATUS } from '@/features/assignments/detail-api';
import { gradingApi } from '@/features/assignments/grading-api';
import { useMyPermissionCodes } from '@/features/chat/api';
import { SUBMISSION_FILTERS, useClassSubmissionList, useSubmissionAdmin, type ClassSubmissionItem } from '@/features/classes/class-admin-api';
import { useStaffClasses } from '@/features/classes/staff-api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Bài nộp của lớp (gộp 2 tab web "Danh sách bài nộp" + "Review bài nhận xét"): lọc trạng thái / bài tập,
 * tìm học viên. Bấm 1 bài: chờ nhận xét → nhận bài & chấm; chờ review → màn review; đã xong → kết quả.
 * Ở bộ lọc "Chờ review" có chọn nhiều → Duyệt nhanh (POST /assignments/submissions/review/bulk).
 */
export default function ClassSubmissionsScreen() {
  const { id, status: initialStatus } = useLocalSearchParams<{ id: string; status?: string }>();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const { data: token } = useMediaToken();
  const cls = useStaffClasses().data?.find((c) => c._id === id);
  const perms = useMyPermissionCodes().data ?? [];
  const canReview = perms.includes('SUBMISSION_REVIEW');
  const canClaim = perms.includes('SUBMISSION_CLAIM');

  const [status, setStatus] = useState(initialStatus ?? 'ALL');
  const [assignmentId, setAssignmentId] = useState('ALL');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opening, setOpening] = useState<string | null>(null);

  const list = useClassSubmissionList(id, { status, search: q, assignmentId });
  const assignments = useClassAssignments(id, true);
  const admin = useSubmissionAdmin();
  const pull = usePullRefresh(() => list.refetch());
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.data) ?? [], [list.data]);
  const total = list.data?.pages[0]?.pagination?.total ?? 0;
  const assignmentList = useMemo(() => assignments.data?.pages.flatMap((p) => p.data) ?? [], [assignments.data]);
  const reviewMode = status === 'waiting_review' && canReview;
  const menu = useActionSheet();

  const open = async (s: ClassSubmissionItem) => {
    if (s.status === 'waiting_review' && canReview) return router.push({ pathname: '/grading/review/[id]', params: { id: s._id } });
    if (s.status === 'completed' || s.status === 'graded') return router.push({ pathname: '/result/[id]', params: { id: s._id, staff: '1' } });
    if (['submitted', 'reassigned', 'claimed', 'timeout'].includes(s.status) && canClaim) {
      setOpening(s._id);
      try {
        if (s.status !== 'claimed') await gradingApi.claim(s._id);
        router.push({ pathname: '/grading/[id]', params: { id: s._id } });
      } catch (e) {
        showToast('error', 'Không nhận được bài', getErrorMessage(e));
      } finally {
        setOpening(null);
      }
      return;
    }
    router.push({ pathname: '/result/[id]', params: { id: s._id, staff: '1' } });
  };

  const remove = (s: ClassSubmissionItem) =>
    menu.confirm({
      title: 'Xoá bài nộp?',
      message: `Bài của ${s.student_name} sẽ bị xoá, học viên phải nộp lại. Không hoàn tác được.`,
      label: 'Xoá',
      icon: 'trash-outline',
      onConfirm: () => admin.remove.mutate(s._id, { onError: (e) => showToast('error', 'Không xoá được', getErrorMessage(e)) }),
    });

  const bulk = () =>
    menu.confirm({
      title: `Duyệt nhanh ${selected.size} bài?`,
      message: 'Nhận xét của người chấm được giữ nguyên và gửi cho học viên.',
      label: 'Duyệt',
      icon: 'checkmark-done-outline',
      danger: false,
      onConfirm: () =>
          admin.bulkReview.mutate([...selected], {
            onSuccess: (r) => {
              setSelected(new Set());
              const skipped = r.skipped_ids?.length ?? 0;
              showToast('success', `Đã duyệt ${r.reviewed_count ?? 0} bài`, skipped ? `${skipped} bài đã được xử lý trước đó nên bỏ qua.` : undefined);
            },
            onError: (e) => showToast('error', 'Chưa duyệt được', getErrorMessage(e)),
        }),
    });

  const pickAssignment = () => {
    const opts = [{ _id: 'ALL', title: 'Tất cả bài tập' }, ...assignmentList];
    menu.show({
      title: 'Lọc theo bài tập',
      actions: opts.map((o) => ({
        label: o.title,
        selected: o._id === assignmentId,
        onPress: () => setAssignmentId(o._id),
      })),
    });
  };
  const assignmentLabel = assignmentId === 'ALL' ? 'Tất cả bài tập' : (assignmentList.find((a) => a._id === assignmentId)?.title ?? 'Bài tập');

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: cls?.class_code ? `Bài nộp · ${cls.class_code}` : 'Bài nộp', headerShown: true }} />
      <FlatList
        data={items}
        keyExtractor={(s) => s._id}
        extraData={`${selected.size}|${opening}`}
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: reviewMode && selected.size ? 110 : 28, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        ListHeaderComponent={
          <View className="gap-2.5 px-4 pb-3 pt-3">
            <View className="h-11 flex-row items-center gap-2 rounded-full bg-surface-muted px-4">
              <Ionicons name="search" size={17} color={muted} />
              <TextInput value={search} onChangeText={setSearch} placeholder="Tìm học viên…" placeholderTextColor={muted} className="flex-1 text-[15px] text-foreground" />
            </View>
            {/* XUỐNG DÒNG chứ không cuộn ngang: 9 bộ lọc mà cuộn thì 5 cái cuối luôn khuất ngoài
                mép màn hình. Cả khối này nằm trong ListHeaderComponent nên cuộn danh sách là nó đi lên. */}
            <View className="flex-row flex-wrap gap-2">
              {SUBMISSION_FILTERS.map((f) => (
                <Pressable
                  key={f.value}
                  onPress={() => {
                    setStatus(f.value);
                    setSelected(new Set());
                  }}
                  className={`h-8 justify-center rounded-full px-3 ${status === f.value ? 'bg-brand' : 'bg-surface-muted'}`}>
                  <Text className={`text-[12.5px] font-semibold ${status === f.value ? 'text-white' : 'text-foreground'}`}>{f.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={pickAssignment} className="flex-row items-center gap-2 self-start rounded-full bg-surface px-3.5 py-2 active:opacity-70">
              <Ionicons name="filter" size={14} color={muted} />
              <Text className="max-w-[260px] text-[13px] font-semibold text-foreground" numberOfLines={1}>
                {assignmentLabel}
              </Text>
              <Ionicons name="chevron-down" size={14} color={muted} />
            </Pressable>
            <Text className="text-[12.5px] text-muted">
              {total} bài nộp{reviewMode ? ' · chọn nhiều bài để duyệt nhanh' : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          list.isLoading ? <ActivityIndicator className="py-10" color={brand} /> : <StateView icon="documents-outline" title="Không có bài nộp nào" />
        }
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator className="py-3" color={brand} /> : null}
        renderItem={({ item: s }) => {
          const st = SUBMISSION_STATUS[s.status] ?? { label: s.status, tone: 'info' as const };
          const checked = selected.has(s._id);
          return (
            <View className="px-4 pb-2">
              <Pressable
                onPress={() =>
                  reviewMode
                    ? setSelected((cur) => {
                        const next = new Set(cur);
                        if (next.has(s._id)) next.delete(s._id);
                        else next.add(s._id);
                        return next;
                      })
                    : void open(s)
                }
                onLongPress={() => (s.status === 'submitted' ? remove(s) : undefined)}
                className={`flex-row items-center gap-3 rounded-3xl bg-surface p-3.5 active:opacity-90 ${checked ? 'border-2 border-brand' : ''}`}>
                {reviewMode ? <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={22} color={checked ? brand : '#9ca3af'} /> : null}
                <Avatar name={s.student_name} uri={resolveMediaUrl(s.student_avatar, token?.media_token)} size={40} />
                <View className="flex-1 gap-0.5">
                  <Text className="text-[14.5px] font-bold text-foreground" numberOfLines={1}>
                    {s.student_name}
                  </Text>
                  <Text className="text-[12.5px] text-muted" numberOfLines={1}>
                    {s.assignment_title}
                  </Text>
                  <View className="flex-row flex-wrap items-center gap-1.5 pt-0.5">
                    <Badge label={s.requires_grading === false || s.grading_exempt ? 'Không cần chấm' : st.label} tone={s.requires_grading === false || s.grading_exempt ? 'violet' : st.tone} />
                    {s.is_late ? <Badge label="Trễ" tone="warning" /> : null}
                    {s.attempt_number > 1 ? <Badge label={`Lần ${s.attempt_number}`} tone="neutral" /> : null}
                    <Text className="text-[11.5px] text-muted">{formatDateTime(s.submitted_at)}</Text>
                  </View>
                </View>
                {opening === s._id ? (
                  <ActivityIndicator color={brand} />
                ) : s.score !== null && s.score !== undefined ? (
                  <View className="items-end">
                    <Text className="text-[17px] font-extrabold text-foreground">{s.score}</Text>
                    {s.max_score ? <Text className="text-[11px] text-muted">/{s.max_score}</Text> : null}
                  </View>
                ) : !reviewMode ? (
                  <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
                ) : null}
              </Pressable>
            </View>
          );
        }}
      />
      {reviewMode && selected.size ? (
        <View className="absolute bottom-0 left-0 right-0 flex-row gap-2.5 border-t border-border bg-surface px-4 pb-8 pt-3">
          <Pressable onPress={() => setSelected(new Set())} className="h-12 flex-1 items-center justify-center rounded-2xl bg-surface-muted">
            <Text className="text-[15px] font-bold text-foreground">Bỏ chọn</Text>
          </Pressable>
          <Pressable onPress={bulk} disabled={admin.bulkReview.isPending} className="h-12 flex-[2] flex-row items-center justify-center gap-2 rounded-2xl bg-brand active:opacity-85">
            <Ionicons name="checkmark-done" size={18} color="#fff" />
            <Text className="text-[15px] font-bold text-white">Duyệt nhanh {selected.size} bài</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
