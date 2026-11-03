import { Ionicons } from '@expo/vector-icons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Segmented } from '@/components/ui/segmented';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { SUBMISSION_STATUS } from '@/features/assignments/detail-api';
import { SymStaffProgress } from '@/features/assignments/sym-staff-progress';
import {
  SYM_LEVEL_LABEL,
  useSubmissionBreakdown,
  type BreakdownStudent,
  type ShadowingStudentProgress,
  type SubmissionBreakdown,
} from '@/features/classes/class-admin-api';
import { useGroupScope } from '@/features/classes/teach-api';
import { getErrorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

type Tab = 'on_time' | 'late' | 'not_submitted';

/** Bài thường = nộp bài; bài Shadowing / SYM không có "nộp" → đổi nhãn theo nghĩa hoàn thành (y web). */
const TAB_LABEL: Record<Tab, string> = { on_time: 'Đúng hạn', late: 'Nộp muộn', not_submitted: 'Chưa nộp' };
const DONE_TAB_LABEL: Record<Tab, string> = { on_time: 'Xong đúng hạn', late: 'Xong trễ', not_submitted: 'Chưa xong' };
const EMPTY: Record<Tab, string> = {
  on_time: 'Chưa có học viên nào nộp đúng hạn',
  late: 'Không có học viên nào nộp muộn',
  not_submitted: 'Tất cả học viên đã nộp',
};
const DONE_EMPTY: Record<Tab, string> = {
  on_time: 'Chưa có học viên nào hoàn thành đúng hạn',
  late: 'Không có học viên nào hoàn thành trễ',
  not_submitted: 'Tất cả học viên đã hoàn thành',
};

/**
 * Danh sách nộp bài / tiến độ học viên của MỘT bài tập — bản mobile của web
 * classes/[classId]/SubmissionBreakdownModal.tsx (GET /assignments/:id/submission-breakdown).
 * Bài Speak Your Mind: mỗi học viên hiện tiến độ bài nghe (x/y câu, điểm cao nhất so với ngưỡng đạt,
 * hoàn thành / cần làm lại / trễ) thay vì trạng thái nộp-chấm. `?group=<id>`: chỉ học viên của nhóm.
 */
export default function AssignmentBreakdownScreen() {
  const { assignment, group, tab: initialTab, type } = useLocalSearchParams<{ id: string; assignment: string; group?: string; tab?: Tab; type?: string }>();
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const scope = useGroupScope(group);
  const query = useSubmissionBreakdown(assignment);
  const pull = usePullRefresh(() => query.refetch());
  const [tab, setTab] = useState<Tab>(initialTab ?? 'on_time');
  const [search, setSearch] = useState('');
  const q = useDeferredValue(search.trim().toLowerCase());

  const data = query.data;
  const doneMode = !!(data?.sym || data?.shadowing);
  const lists = useMemo(() => {
    const pick = (rows: BreakdownStudent[] = []) => (scope.ids ? rows.filter((s) => scope.ids!.has(s._id)) : rows);
    return { on_time: pick(data?.on_time), late: pick(data?.late), not_submitted: pick(data?.not_submitted) };
  }, [data, scope.ids]);
  const rows = useMemo(
    () => (q ? lists[tab].filter((s) => `${s.name} ${s.email ?? ''}`.toLowerCase().includes(q)) : lists[tab]),
    [lists, tab, q],
  );
  const labels = doneMode ? DONE_TAB_LABEL : TAB_LABEL;

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: doneMode ? 'Tiến độ học viên' : 'Danh sách nộp bài', headerShown: true }} />
      {query.isLoading || scope.pending ? (
        <LoadingView />
      ) : query.isError || !data ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được danh sách"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(s) => s._id}
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: 28, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListHeaderComponent={
            <View className="gap-3 px-4 pb-3 pt-3">
              <InfoCard data={data} />
              <Segmented
                items={(['on_time', 'late', 'not_submitted'] as Tab[]).map((t) => ({ value: t, label: labels[t], count: lists[t].length }))}
                value={tab}
                onChange={setTab}
              />
              <View className="h-11 flex-row items-center gap-2 rounded-full bg-surface-muted px-4">
                <Ionicons name="search" size={17} color={muted} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Tìm học viên…"
                  placeholderTextColor={muted}
                  autoCorrect={false}
                  className="flex-1 text-[15px] text-foreground"
                />
              </View>
            </View>
          }
          ListEmptyComponent={
            <StateView icon="people-outline" title={q ? 'Không có học viên khớp' : (doneMode ? DONE_EMPTY : EMPTY)[tab]} />
          }
          renderItem={({ item }) => <StudentRow s={item} data={data} tvst={type === 'tvst_business'} />}
        />
      )}
    </View>
  );
}

function InfoCard({ data }: { data: SubmissionBreakdown }) {
  const sym = data.sym;
  return (
    <View className="gap-1.5 rounded-3xl bg-surface p-3.5">
      <Text className="text-[15px] font-semibold leading-5 text-foreground">{data.assignment_title}</Text>
      {sym ? (
        <>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Badge label="Speak Your Mind" tone="violet" />
            <Badge label={`${sym.total} câu`} tone="info" />
            {sym.level ? (
              <Badge label={`Mức ${SYM_LEVEL_LABEL[sym.level]}`} tone="brand" />
            ) : (
              <Badge label="HV tự chọn mức" tone="neutral" />
            )}
          </View>
          {sym.exercise_title ? (
            <Text className="text-[12.5px] text-muted" numberOfLines={2}>
              Bài nghe: {[sym.unit_title, sym.exercise_title].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          <Text className="text-[12.5px] text-muted">
            Hoàn thành khi làm hết bài và đúng trên {sym.pass_score}% — không cần nộp hay nhận xét.
          </Text>
        </>
      ) : data.shadowing ? (
        <Text className="text-[12.5px] text-muted">
          Shadowing · {data.shadowing.parts_total} part · cần đúng ≥ {data.shadowing.min_accuracy}%
          {data.shadowing.targets_label ? ` · ${data.shadowing.targets_label}` : ''}
        </Text>
      ) : data.requires_grading === false ? (
        <Text className="text-[12.5px] text-muted">Bài không cần nhận xét.</Text>
      ) : null}
    </View>
  );
}

function StudentRow({ s, data, tvst }: { s: BreakdownStudent; data: SubmissionBreakdown; tvst?: boolean }) {
  const sym = data.sym;
  // TVST Business: xem được cả bản nháp của HV chưa nộp (GET …/tvst-business/students/:id)
  const canOpen = tvst || (!sym && !data.shadowing && !!s.submission_id);
  const st = s.status ? (SUBMISSION_STATUS[s.status] ?? { label: s.status, tone: 'info' as const }) : null;
  return (
    <View className="px-4 pb-2">
      <Pressable
        disabled={!canOpen}
        onPress={() =>
          tvst
            ? router.push({ pathname: '/tvst-business/[assignmentId]', params: { assignmentId: data.assignment_id, studentId: s._id, name: s.name } })
            : router.push({ pathname: '/result/[id]', params: { id: s.submission_id!, staff: '1' } })
        }
        className="gap-2.5 rounded-3xl bg-surface p-3.5 active:opacity-90">
        <View className="flex-row items-center gap-3">
          <Avatar name={s.name} size={36} />
          <View className="flex-1 gap-0.5">
            <Text className="text-[14.5px] font-bold text-foreground" numberOfLines={1}>
              {s.name}
            </Text>
            {s.group_name || s.email ? (
              <Text className="text-[12px] text-muted" numberOfLines={1}>
                {[s.group_name, s.email].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
          {canOpen && s.score != null ? (
            <Text className="text-[16px] font-extrabold text-foreground">
              {s.score}
              {s.max_score ? <Text className="text-[11px] font-normal text-muted">/{s.max_score}</Text> : null}
            </Text>
          ) : canOpen ? (
            <Ionicons name="chevron-forward" size={16} color="#9ca3af" />
          ) : null}
        </View>
        {sym ? (
          <SymStaffProgress progress={s.sym_progress} total={sym.total} passScore={sym.pass_score} />
        ) : data.shadowing ? (
          <ShadowingProgress
            progress={s.shadowing_progress}
            partsTotal={data.shadowing.parts_total}
            minAccuracy={data.shadowing.min_accuracy}
          />
        ) : s.submission_id ? (
          <View className="flex-row flex-wrap items-center gap-1.5">
            {s.grading_exempt || data.requires_grading === false ? (
              <Badge label="Không cần chấm" tone="violet" />
            ) : st ? (
              <Badge label={st.label} tone={st.tone} />
            ) : null}
            <Text className="text-[11.5px] text-muted">Nộp {formatDateTime(s.submitted_at)}</Text>
            {s.grader_name ? <Text className="text-[11.5px] text-muted">· {s.grader_name}</Text> : null}
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

function ShadowingProgress({
  progress,
  partsTotal,
  minAccuracy,
}: {
  progress?: ShadowingStudentProgress | null;
  partsTotal: number;
  minAccuracy: number;
}) {
  if (!progress || progress.status === 'assigned') return <Text className="text-[12.5px] text-muted">Chưa luyện</Text>;
  const total = progress.parts_total || partsTotal;
  const pct = total ? Math.round((progress.parts_completed / total) * 100) : 0;
  const below = typeof progress.accuracy === 'number' && progress.accuracy < minAccuracy;
  const done = progress.status === 'completed';
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-[13px] font-semibold text-foreground">
          {progress.parts_completed}/{total} part
        </Text>
        <Text className={`text-[13px] font-bold ${below ? 'text-warning' : 'text-success'}`}>
          {typeof progress.accuracy === 'number' ? `${Math.round(progress.accuracy)}%` : '—'}
        </Text>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <View className={`h-full rounded-full ${done ? 'bg-success' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
      </View>
      <Text className="text-[11.5px] text-muted">
        {progress.practice_minutes} phút luyện
        {progress.last_activity_at ? ` · ${formatDateTime(progress.last_activity_at)}` : ''}
      </Text>
    </View>
  );
}
