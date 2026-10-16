import { Ionicons } from '@expo/vector-icons';
import { router, Stack } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';

import { useActionSheet } from '@/components/ui/action-sheet';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { StateView } from '@/components/ui/state-view';
import { useGraders } from '@/features/assignments/grading-api';
import { MANAGED_STATUS_VIEW, MANAGEMENT_STATUS, useGradingManagement, type ManagedSubmission } from '@/features/assignments/management-api';
import { useStaffClasses } from '@/features/classes/staff-api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Quản lý chấm bài (web /assignments/grading-management): đối soát ai chấm, ai duyệt từng bài nộp.
 * Tìm + lọc trạng thái, lớp, người chấm. Bấm bài chờ review → màn review; bài khác → kết quả.
 */
export default function GradingManagementScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const { data: token } = useMediaToken();
  const sheet = useActionSheet();
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim());
  const [status, setStatus] = useState('ALL');
  const [classId, setClassId] = useState('ALL');
  const [graderId, setGraderId] = useState('ALL');

  const list = useGradingManagement({ search: q, status, classId, graderId });
  const classes = useStaffClasses();
  const graders = useGraders(true);
  const pull = usePullRefresh(() => list.refetch());
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.data) ?? [], [list.data]);
  const total = list.data?.pages[0]?.pagination?.total ?? 0;

  const classList = useMemo(() => [...(classes.data ?? [])].sort((a, b) => a.class_code.localeCompare(b.class_code)), [classes.data]);
  const graderList = graders.data ?? [];
  const className = classId === 'ALL' ? 'Tất cả lớp' : (classList.find((c) => c._id === classId)?.class_code ?? 'Lớp');
  const graderName = graderId === 'ALL' ? 'Mọi người chấm' : (graderList.find((g) => g._id === graderId)?.name ?? graderList.find((g) => g._id === graderId)?.full_name ?? 'Người chấm');

  const pickClass = () =>
    sheet.show({
      title: 'Lọc theo lớp',
      actions: [
        { label: 'Tất cả lớp', selected: classId === 'ALL', onPress: () => setClassId('ALL') },
        ...classList.map((c) => ({ label: `${c.class_code} · ${c.display_name || c.class_name}`, selected: classId === c._id, onPress: () => setClassId(c._id) })),
      ],
    });
  const pickGrader = () =>
    sheet.show({
      title: 'Lọc theo người chấm',
      actions: [
        { label: 'Mọi người chấm', selected: graderId === 'ALL', onPress: () => setGraderId('ALL') },
        ...graderList.map((g) => ({
          label: `${g.name || g.full_name || g.email || g._id}${g.role_code ? ` (${g.role_code})` : ''}`,
          selected: graderId === g._id,
          onPress: () => setGraderId(g._id),
        })),
      ],
    });

  const open = (s: ManagedSubmission) =>
    s.status === 'waiting_review'
      ? router.push({ pathname: '/grading/review/[id]', params: { id: s._id } })
      : router.push({ pathname: '/result/[id]', params: { id: s._id, staff: '1' } });

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Quản lý chấm bài', headerShown: true }} />
      <FlatList
        data={items}
        keyExtractor={(s) => s._id}
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: 28, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        ListHeaderComponent={
          <View className="gap-2.5 px-4 pb-3 pt-3">
            <View className="h-11 flex-row items-center gap-2 rounded-full bg-surface-muted px-4">
              <Ionicons name="search" size={17} color={muted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Tìm học viên, bài tập…"
                placeholderTextColor={muted}
                className="flex-1 text-[15px] text-foreground"
              />
              {search ? (
                <Pressable hitSlop={8} onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={18} color={muted} />
                </Pressable>
              ) : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-4" contentContainerClassName="gap-2 px-4">
              {MANAGEMENT_STATUS.map((f) => (
                <Pressable
                  key={f.value}
                  onPress={() => setStatus(f.value)}
                  className={`h-9 justify-center rounded-full px-3.5 ${status === f.value ? 'bg-brand' : 'bg-surface-muted'}`}>
                  <Text className={`text-[13px] font-semibold ${status === f.value ? 'text-white' : 'text-foreground'}`}>{f.label}</Text>
                </Pressable>
              ))}
              <FilterChip icon="business-outline" label={className} active={classId !== 'ALL'} onPress={pickClass} />
              <FilterChip icon="person-outline" label={graderName} active={graderId !== 'ALL'} onPress={pickGrader} />
            </ScrollView>
            {!list.isLoading ? <Text className="text-[12.5px] text-muted">{total.toLocaleString('vi-VN')} bài nộp</Text> : null}
          </View>
        }
        ListEmptyComponent={
          list.isLoading ? (
            <ActivityIndicator className="py-10" color={brand} />
          ) : list.isError ? (
            <StateView icon="cloud-offline-outline" title="Không tải được danh sách" description={getErrorMessage(list.error)} actionLabel="Thử lại" onAction={() => list.refetch()} />
          ) : (
            <StateView icon="file-tray-outline" title="Không có bài nộp nào" />
          )
        }
        ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator className="py-3" color={brand} /> : null}
        renderItem={({ item: s }) => {
          const noGrading = !s.requires_grading || !!s.grading_exempt;
          const st = noGrading ? { label: 'Không cần chấm', tone: 'violet' as const } : (MANAGED_STATUS_VIEW[s.status] ?? { label: s.status, tone: 'neutral' as const });
          return (
            <View className="px-4 pb-2">
              <Pressable onPress={() => open(s)} className="gap-2.5 rounded-3xl bg-surface p-3.5 active:opacity-90">
                <View className="flex-row items-center gap-3">
                  <Avatar name={s.student_name} uri={resolveMediaUrl(s.student_avatar, token?.media_token)} size={40} />
                  <View className="flex-1 gap-0.5">
                    <Text className="text-[14.5px] font-bold text-foreground" numberOfLines={1}>
                      {s.student_name}
                    </Text>
                    <Text className="text-[12.5px] text-muted" numberOfLines={1}>
                      {s.assignment_title}
                      {s.class_name ? ` · ${s.class_name}` : ''}
                    </Text>
                  </View>
                  {!noGrading && s.score !== null ? (
                    <View className="items-end">
                      <Text className="text-[18px] font-extrabold text-foreground">{s.score}</Text>
                      {s.max_score ? <Text className="text-[11px] text-muted">/{s.max_score}</Text> : null}
                    </View>
                  ) : null}
                </View>
                <View className="flex-row gap-2">
                  <Person label="Người chấm" name={s.grader_name} avatar={resolveMediaUrl(s.grader_avatar, token?.media_token)} />
                  <Person label="Người duyệt" name={s.reviewer_name} avatar={resolveMediaUrl(s.reviewer_avatar, token?.media_token)} />
                </View>
                <View className="flex-row flex-wrap items-center gap-1.5">
                  <Badge label={st.label} tone={st.tone} />
                  {s.attempt_number > 1 ? <Badge label={`Lần ${s.attempt_number}`} tone="neutral" /> : null}
                  <Text className="text-[11.5px] text-muted">{formatDateTime(s.graded_at || s.submitted_at)}</Text>
                  <View className="flex-1" />
                  {s.status === 'waiting_review' ? (
                    <View className="flex-row items-center gap-1 rounded-full bg-info-soft px-2.5 py-1">
                      <Ionicons name="clipboard" size={12} color="#2563eb" />
                      <Text className="text-[11.5px] font-bold text-info">Review</Text>
                    </View>
                  ) : (
                    <Ionicons name="chevron-forward" size={15} color="#9ca3af" />
                  )}
                </View>
              </Pressable>
            </View>
          );
        }}
      />
      {sheet.sheet}
    </View>
  );
}

function FilterChip({ icon, label, active, onPress }: { icon: 'business-outline' | 'person-outline'; label: string; active: boolean; onPress: () => void }) {
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  return (
    <Pressable onPress={onPress} className={`h-9 flex-row items-center gap-1.5 rounded-full px-3.5 ${active ? 'bg-brand-soft' : 'bg-surface-muted'}`}>
      <Ionicons name={icon} size={14} color={active ? brand : muted} />
      <Text className={`max-w-[160px] text-[13px] font-semibold ${active ? 'text-brand' : 'text-foreground'}`} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={13} color={active ? brand : muted} />
    </Pressable>
  );
}

function Person({ label, name, avatar }: { label: string; name: string; avatar?: string | null }) {
  const empty = !name || name === '—';
  return (
    <View className="flex-1 flex-row items-center gap-2 rounded-2xl bg-surface-muted px-2.5 py-2">
      {empty ? (
        <View className="h-6 w-6 items-center justify-center rounded-full bg-surface">
          <Ionicons name="remove" size={12} color="#9ca3af" />
        </View>
      ) : (
        <Avatar name={name} uri={avatar} size={24} />
      )}
      <View className="flex-1">
        <Text className="text-[10.5px] text-muted">{label}</Text>
        <Text className={`text-[12.5px] font-semibold ${empty ? 'text-muted' : 'text-foreground'}`} numberOfLines={1}>
          {empty ? 'Chưa có' : name}
        </Text>
      </View>
    </View>
  );
}
