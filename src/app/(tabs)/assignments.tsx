import { useDeferredValue, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Ionicons } from '@expo/vector-icons';

import { useTabBarSpace } from '@/components/ui/floating-tab-bar';
import { LoadingView, StateView } from '@/components/ui/state-view';
import {
  STATUS_FILTERS,
  useMyAssignments,
  useMyAssignmentTotal,
  useMyTodoAssignments,
  type AssignmentStatusFilter,
  type StudentAssignmentItem,
} from '@/features/assignments/api';
import { AssignmentCard } from '@/features/assignments/assignment-card';
import { openAssignment } from '@/features/assignments/detail-api';
import { useMyClasses } from '@/features/classes/api';
import { PickerSheet, type PickerOption } from '@/features/video-scripts/components';
import { GradingQueueScreen } from '@/features/assignments/grading-queue';
import { getErrorMessage } from '@/lib/api/client';
import { addDays, startOfDay, startOfWeek } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { isStaffRole } from '@/navigation/features';
import { useAuthStore } from '@/stores/auth.store';
import { MenuButton } from '@/features/navigation/app-menu';
import { useThemeColor } from '@/theme/use-theme-color';

export default function AssignmentsScreen() {
  const staff = isStaffRole(useAuthStore((s) => s.user?.role_code));
  if (staff) return <GradingQueueScreen />;
  return <StudentAssignments />;
}

type Section = { key: string; title: string; tone: 'danger' | 'warning' | 'muted'; data: StudentAssignmentItem[] };

/**
 * Nhóm bài theo hạn nộp (kiểu app việc cần làm): Quá hạn · Hôm nay · Ngày mai · Tuần này · Sau đó ·
 * Không có hạn. Bài đã nộp (khi xem "Tất cả") gom riêng xuống cuối — thứ cần làm luôn nằm trên cùng.
 */
function groupByDeadline(items: StudentAssignmentItem[], now: number): Section[] {
  const today = startOfDay(new Date(now));
  const tomorrow = addDays(today, 1);
  const dayAfter = addDays(today, 2);
  const weekEnd = addDays(startOfWeek(today), 7);
  const buckets: Section[] = [
    { key: 'overdue', title: 'Quá hạn', tone: 'danger', data: [] },
    { key: 'today', title: 'Hôm nay', tone: 'danger', data: [] },
    { key: 'tomorrow', title: 'Ngày mai', tone: 'warning', data: [] },
    { key: 'week', title: 'Tuần này', tone: 'muted', data: [] },
    { key: 'later', title: 'Sau đó', tone: 'muted', data: [] },
    { key: 'nodue', title: 'Không có hạn nộp', tone: 'muted', data: [] },
    { key: 'done', title: 'Đã nộp', tone: 'muted', data: [] },
  ];
  const by = Object.fromEntries(buckets.map((b) => [b.key, b])) as Record<string, Section>;
  for (const a of items) {
    if (a.submission) {
      by.done.data.push(a);
      continue;
    }
    const d = a.submission_deadline ? new Date(a.submission_deadline) : null;
    if (!d) by.nodue.data.push(a);
    else if (d.getTime() < now) by.overdue.data.push(a);
    else if (d < tomorrow) by.today.data.push(a);
    else if (d < dayAfter) by.tomorrow.data.push(a);
    else if (d < weekEnd) by.week.data.push(a);
    else by.later.data.push(a);
  }
  // Trong nhóm cần làm: hạn gần lên trước
  const byDue = (x: StudentAssignmentItem, y: StudentAssignmentItem) =>
    (x.submission_deadline ?? '9').localeCompare(y.submission_deadline ?? '9');
  for (const k of ['overdue', 'today', 'tomorrow', 'week', 'later']) by[k].data.sort(byDue);
  return buckets.filter((b) => b.data.length);
}

/** Bài tập của mọi lớp — mặc định "Tất cả" (anh chốt 06/11/2026); vẫn nhóm theo hạn nên việc cần làm nằm trên, bài đã nộp xuống cuối. */
function StudentAssignments() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const insets = useSafeAreaInsets();
  const tabBarSpace = useTabBarSpace();
  const [status, setStatus] = useState<AssignmentStatusFilter>('all');
  const [search, setSearch] = useState('');
  /** Lọc theo lớp ('' = mọi lớp) — danh sách lớp là các lớp mình đang tham gia học (anh yêu cầu 06/11/2026) */
  const [classId, setClassId] = useState('');
  const [pickingClass, setPickingClass] = useState(false);
  const [now] = useState(() => Date.now());
  // Hoãn giá trị tìm kiếm: gõ nhanh thì chỉ gọi API ở nhịp nghỉ, không mỗi phím một lượt
  const q = useMyAssignments({ status, search: useDeferredValue(search.trim()), classId: classId || undefined });
  // Số đếm lấy từ server (danh sách "Chưa nộp" + tổng "Quá hạn" theo lớp) — 200 bài đầu không đủ cho tài khoản nhiều bài
  const todoAll = useMyTodoAssignments();
  const overdueTotal = useMyAssignmentTotal('overdue', classId || undefined);
  const classes = useMyClasses();
  const classOptions = useMemo<PickerOption[]>(() => {
    const pending = new Map<string, number>();
    // Chỉ đếm "chưa nộp" (còn hạn) như chip — đếm cả quá hạn thì lớp cũ đã xong cũng hiện vài chục bài
    for (const a of todoAll.data ?? []) pending.set(a.class_id, (pending.get(a.class_id) ?? 0) + 1);
    // Lớp đang học lên trước lớp đã xong; trong mỗi nhóm lớp còn nhiều bài chưa nộp lên trước
    const done = (c: { progress?: number }) => Number((c.progress ?? 0) >= 100);
    const list = [...(classes.data ?? [])].sort((x, y) => done(x) - done(y) || (pending.get(y._id) ?? 0) - (pending.get(x._id) ?? 0));
    return [
      { value: '', label: 'Tất cả lớp' },
      ...list.map((c) => {
        const n = pending.get(c._id) ?? 0;
        return {
          value: c._id,
          label: c.display_name || c.class_name,
          sublabel: `${c.class_code}${done(c) ? ' · Đã hoàn thành' : ''}${n ? ` · ${n} bài chưa nộp` : ''}`,
          keywords: c.class_name,
        };
      }),
    ];
  }, [classes.data, todoAll.data]);
  const pickedClass = classId ? classOptions.find((o) => o.value === classId) : undefined;
  const pull = usePullRefresh(() => Promise.all([q.refetch(), todoAll.refetch(), overdueTotal.refetch()]));
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.data) ?? [], [q.data]);

  // Số trên chip lọc — khớp bộ lọc của server: "Chưa nộp" KHÔNG gồm bài đã quá hạn (đó là "Quá hạn")
  const counts = {
    todo: (todoAll.data ?? []).filter((a) => !classId || a.class_id === classId).length,
    overdue: overdueTotal.data ?? 0,
  };

  // Chỉ nhóm theo hạn khi đang xem việc cần làm; các bộ lọc khác giữ thứ tự mới → cũ
  const sections = useMemo<Section[]>(() => {
    if (status === 'not_submitted' || status === 'overdue' || status === 'all') return groupByDeadline(items, now);
    return items.length ? [{ key: 'list', title: '', tone: 'muted', data: items }] : [];
  }, [items, status, now]);

  const searching = search.trim().length > 0;

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top + 8 }}>
      <View className="flex-row items-center gap-3 px-4 pb-2">
        <MenuButton />
        <Text className="flex-1 text-[28px] font-extrabold tracking-tight text-foreground" numberOfLines={1}>
          Bài tập
        </Text>
      </View>

      <View className="h-11 flex-row items-center gap-2 rounded-full bg-surface-muted px-4" style={{ marginHorizontal: 16, marginTop: 10 }}>
        <Ionicons name="search" size={17} color={muted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Tìm bài tập…"
          placeholderTextColor={muted}
          autoCorrect={false}
          returnKeyType="search"
          className="flex-1 text-[15px] text-foreground"
        />
        {search ? (
          <Pressable hitSlop={8} onPress={() => setSearch('')} accessibilityLabel="Xoá tìm kiếm">
            <Ionicons name="close-circle" size={18} color={muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Chọn lớp: 1 nút mở bảng chọn có ô tìm (lớp có thể vài chục) — đang lọc thì nút đỏ nhạt + nút ✕ bỏ lọc */}
      <View className="flex-row items-center gap-2 px-4 pt-3">
        <Pressable
          onPress={() => setPickingClass(true)}
          accessibilityRole="button"
          accessibilityLabel="Lọc theo lớp"
          className={`h-10 flex-1 flex-row items-center gap-2 rounded-full border px-4 active:opacity-80 ${
            pickedClass ? 'border-brand/30 bg-brand-soft' : 'border-border bg-surface'
          }`}>
          <Ionicons name="school-outline" size={17} color={pickedClass ? brand : muted} />
          <Text className={`flex-1 text-[14px] font-semibold ${pickedClass ? 'text-brand' : 'text-foreground'}`} numberOfLines={1}>
            {pickedClass ? pickedClass.label : 'Tất cả lớp'}
          </Text>
          <Ionicons name="chevron-down" size={16} color={pickedClass ? brand : muted} />
        </Pressable>
        {pickedClass ? (
          <Pressable
            onPress={() => setClassId('')}
            hitSlop={6}
            accessibilityLabel="Bỏ lọc lớp"
            className="h-10 w-10 items-center justify-center rounded-full bg-surface-muted active:opacity-80">
            <Ionicons name="close" size={18} color={muted} />
          </Pressable>
        ) : null}
      </View>

      {/* Chip lọc XUỐNG DÒNG, không cuộn ngang: 6 bộ lọc mà cuộn thì 2 cái cuối luôn bị khuất */}
      <View className="flex-row flex-wrap gap-2 px-4 py-3">
        {STATUS_FILTERS.map((f) => {
          const on = status === f.value;
          const badge = f.value === 'not_submitted' ? counts.todo : f.value === 'overdue' ? counts.overdue : 0;
          return (
            <Pressable
              key={f.value}
              onPress={() => setStatus(f.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              className={`h-9 flex-row items-center gap-1.5 rounded-full px-4 active:opacity-80 ${on ? 'bg-brand' : 'bg-surface-muted'}`}>
              <Text className={`text-[14px] font-semibold ${on ? 'text-on-brand' : 'text-muted'}`}>{f.label}</Text>
              {badge > 0 ? (
                <View className={`h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 ${on ? 'bg-on-brand' : 'bg-brand'}`}>
                  <Text className={`text-[10.5px] font-bold ${on ? 'text-brand' : 'text-on-brand'}`}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Số kết quả chỉ hiện lúc đang tìm — các con số khác đã nằm sẵn trên chip lọc */}
      {searching ? (
        <Text className="px-4 pb-2 text-[12.5px] font-medium text-muted">
          {items.length} kết quả cho “{search.trim()}”
        </Text>
      ) : null}

      {q.isLoading ? (
        <LoadingView />
      ) : q.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được bài tập"
          description={getErrorMessage(q.error)}
          actionLabel="Thử lại"
          onAction={() => q.refetch()}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(a) => a._id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarSpace }}
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
          }}
          ItemSeparatorComponent={() => <View className="h-2.5" />}
          renderSectionHeader={({ section }) =>
            section.title ? (
              <View className="flex-row items-center gap-2 pb-2.5 pt-4">
                <Text
                  className={`text-[13px] font-bold uppercase tracking-wide ${
                    section.tone === 'danger' ? 'text-danger' : section.tone === 'warning' ? 'text-warning' : 'text-muted'
                  }`}>
                  {section.title}
                </Text>
                <Text className="text-[13px] font-semibold text-muted">{section.data.length}</Text>
              </View>
            ) : (
              <View className="h-1" />
            )
          }
          ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator className="py-3" color={brand} /> : null}
          ListEmptyComponent={
            <StateView
              icon={searching ? 'search-outline' : status === 'not_submitted' ? 'happy-outline' : 'document-text-outline'}
              title={
                searching
                  ? 'Không tìm thấy bài tập'
                  : status === 'not_submitted'
                    ? 'Không còn bài nào chưa nộp'
                    : 'Không có bài tập phù hợp'
              }
              description={
                searching
                  ? 'Thử từ khoá khác, hoặc đổi bộ lọc phía trên.'
                  : status === 'not_submitted'
                    ? 'Bài mới được giao sẽ hiện ở đây.'
                    : undefined
              }
            />
          }
          renderItem={({ item }) => <AssignmentCard item={item} showClass onPress={() => openAssignment(item)} />}
        />
      )}

      <PickerSheet
        visible={pickingClass}
        title="Lọc theo lớp"
        options={classOptions}
        value={classId}
        searchPlaceholder="Tìm lớp…"
        onSelect={setClassId}
        onClose={() => setPickingClass(false)}
      />
    </View>
  );
}
