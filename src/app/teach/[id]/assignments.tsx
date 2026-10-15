import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { useActionSheet, type SheetAction } from '@/components/ui/action-sheet';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { useClassAssignments } from '@/features/assignments/class-api';
import { ClassAssignmentCard } from '@/features/assignments/class-assignment-card';
import { useMyPermissionCodes } from '@/features/chat/api';
import { useStaffClassDetail, useStaffClasses } from '@/features/classes/staff-api';
import { api, getErrorMessage } from '@/lib/api/client';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Bài tập của lớp (nhân sự) — bấm thẻ để xem tỷ lệ nộp; nút ⋯ (quyền ASSIGNMENT_DUPLICATE / ASSIGNMENT_DELETE
 * như web, trừ bài Shadowing) để sửa / nhân bản / xoá; nút + tạo bài mới (assignment-editor/*).
 */
export default function ClassAssignmentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const [now] = useState(() => Date.now());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const classes = useStaffClasses();
  const cls = classes.data?.find((c) => c._id === id);
  const detail = useStaffClassDetail(id);
  const assignments = useClassAssignments(id, true);
  const items = assignments.data?.pages.flatMap((p) => p.data) ?? [];
  const pull = usePullRefresh(() => assignments.refetch());
  const qc = useQueryClient();
  const perms = useMyPermissionCodes().data ?? [];
  const canDup = perms.includes('ASSIGNMENT_DUPLICATE');
  const canDel = perms.includes('ASSIGNMENT_DELETE');
  const canEdit = perms.includes('ASSIGNMENT_EDIT');
  const canCreate = perms.includes('ASSIGNMENT_CREATE');
  const fg = useThemeColor('foreground');
  const menu = useActionSheet();

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['assignments'] });
      void assignments.refetch();
      showToast('success', ok);
    } catch (e) {
      showToast('error', 'Không thực hiện được', getErrorMessage(e));
    }
  };

  const more = (a: (typeof items)[number]) => {
    const opts: SheetAction[] = [];
    if (canEdit)
      opts.push({
        label: 'Sửa bài tập',
        icon: 'create-outline',
        onPress: () => router.push({ pathname: '/assignment-editor/[assignmentId]', params: { assignmentId: a._id } }),
      });
    if (canDup)
      opts.push({
        label: 'Nhân bản bài tập',
        icon: 'copy-outline',
        onPress: () => void run(() => api.post(`/assignments/${a._id}/duplicate`, {}), 'Đã nhân bản bài tập'),
      });
    if (canDel)
      opts.push({
        label: 'Xoá bài tập',
        icon: 'trash-outline',
        danger: true,
        onPress: () =>
          menu.confirm({
            title: 'Xoá bài tập?',
            message: `"${a.title}" và bài nộp liên quan sẽ bị xoá.`,
            label: 'Xoá',
            icon: 'trash-outline',
            onConfirm: () => void run(() => api.delete(`/assignments/${a._id}`), 'Đã xoá bài tập'),
          }),
      });
    menu.show({ title: a.title, actions: opts });
  };

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: cls?.class_code ? `Bài tập · ${cls.class_code}` : 'Bài tập',
          headerShown: true,
          headerRight: canCreate
            ? () => (
                <Pressable
                  onPress={() => router.push({ pathname: '/assignment-editor/new', params: { classId: id } })}
                  hitSlop={10}
                  accessibilityLabel="Tạo bài tập"
                  className="active:opacity-60">
                  <Ionicons name="add-circle-outline" size={25} color={fg} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(a) => a._id}
        extraData={expandedId}
        renderItem={({ item }) => (
          <View className="px-4 pb-2.5">
            <ClassAssignmentCard
              item={item}
              totalStudents={detail.data?.stats?.total_students}
              expanded={expandedId === item._id}
              overdue={!!item.submission_deadline && new Date(item.submission_deadline).getTime() < now}
              onToggle={() => setExpandedId((c) => (c === item._id ? null : item._id))}
              onMore={(canEdit || canDup || canDel) && !item.shadowing ? () => more(item) : undefined}
            />
          </View>
        )}
        ListEmptyComponent={
          assignments.isLoading ? (
            <LoadingView />
          ) : assignments.isError ? (
            <StateView
              icon="cloud-offline-outline"
              title="Không tải được bài tập"
              actionLabel="Thử lại"
              onAction={() => assignments.refetch()}
            />
          ) : (
            <StateView
              icon="document-text-outline"
              title="Lớp chưa có bài tập nào"
              actionLabel={canCreate ? 'Tạo bài tập' : undefined}
              onAction={canCreate ? () => router.push({ pathname: '/assignment-editor/new', params: { classId: id } }) : undefined}
            />
          )
        }
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 28, flexGrow: 1 }}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (assignments.hasNextPage && !assignments.isFetchingNextPage) void assignments.fetchNextPage();
        }}
        ListFooterComponent={assignments.isFetchingNextPage ? <ActivityIndicator className="py-3" color={brand} /> : null}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
      />
    </View>
  );
}
