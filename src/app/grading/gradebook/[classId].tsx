import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useDeferredValue, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, Text, TextInput, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { LoadingView, StateView } from '@/components/ui/state-view';
import { fold } from '@/features/chat/mentions';
import { useStaffClasses } from '@/features/classes/staff-api';
import {
  cellView,
  studentAverage,
  useGradebook,
  useGroupScope,
  visibleAssignments,
  type CellTone,
  type GradebookAssignment,
  type GradebookStudent,
} from '@/features/classes/teach-api';
import { getErrorMessage } from '@/lib/api/client';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Bảng điểm 1 lớp. Web là bảng rộng học viên × bài tập; trên điện thoại chia 2 góc nhìn:
 * - Theo học viên: mỗi người 1 thẻ (hạng, dải ô màu từng bài, điểm TB), bấm bung ra điểm từng bài.
 * - Theo bài tập: mỗi bài 1 thẻ (điểm TB bài, đã chấm / chờ chấm / chưa nộp).
 * Luật điểm TB + nhãn ô dùng chung với web (teach-api.ts ⇄ uspeak-class-fe src/utils/gradebook.ts):
 * chỉ tính bài đã nộp VÀ có điểm; chưa nộp / không cần chấm / chờ chấm đều bỏ qua.
 */
type View_ = 'students' | 'assignments';
type Sort = 'high' | 'low' | 'name' | 'missing';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'high', label: 'Điểm cao' },
  { value: 'low', label: 'Điểm thấp' },
  { value: 'missing', label: 'Nợ bài nhiều' },
  { value: 'name', label: 'Tên A–Z' },
];

// Viết đủ tên class để Tailwind quét được
const CELL: Record<CellTone, { box: string; text: string; dot: string }> = {
  empty: { box: 'bg-surface-muted', text: 'text-muted', dot: 'bg-border' },
  none: { box: 'bg-violet-soft', text: 'text-violet', dot: 'bg-violet' },
  pending: { box: 'bg-warning-soft', text: 'text-warning', dot: 'bg-warning' },
  great: { box: 'bg-success-soft', text: 'text-success', dot: 'bg-success' },
  good: { box: 'bg-success-soft', text: 'text-success', dot: 'bg-success' },
  fair: { box: 'bg-warning-soft', text: 'text-warning', dot: 'bg-warning' },
  low: { box: 'bg-danger-soft', text: 'text-danger', dot: 'bg-danger' },
};

const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(1).replace(/\.0$/, ''));
const avgTone = (v: number | null) => (v === null ? 'text-muted' : v >= 8 ? 'text-success' : v >= 6 ? 'text-warning' : 'text-danger');

/** Xếp loại theo điểm TB thang 10 (giống Trang chủ học viên). */
const BANDS = [
  { key: 'gioi', label: 'Giỏi', min: 8, bar: 'bg-success' },
  { key: 'kha', label: 'Khá', min: 6.5, bar: 'bg-info' },
  { key: 'tb', label: 'TB', min: 5, bar: 'bg-warning' },
  { key: 'yeu', label: 'Yếu', min: 0, bar: 'bg-danger' },
] as const;

interface StudentRow {
  st: GradebookStudent;
  avg: number | null;
  missing: number;
  pending: number;
}

export default function GradebookScreen() {
  const { classId, group } = useLocalSearchParams<{ classId: string; group?: string }>();
  // ?group=<id> (mở từ trang nhóm): chỉ học viên của nhóm
  const scope = useGroupScope(group);
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const [view, setView] = useState<View_>('students');
  const [sort, setSort] = useState<Sort>('high');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const q = useDeferredValue(fold(search.trim()));

  const query = useGradebook(classId);
  const classes = useStaffClasses();
  const cls = classes.data?.find((c) => c._id === classId);
  const pull = usePullRefresh(() => query.refetch());

  const columns = useMemo(() => (query.data ? visibleAssignments(query.data) : []), [query.data]);
  const grading = useMemo(() => columns.filter((a) => a.requires_grading !== false), [columns]);

  const all = useMemo<StudentRow[]>(
    () =>
      (query.data?.students ?? [])
        .filter((st) => !scope.ids || scope.ids.has(st.student_id))
        .map((st) => ({
        st,
        avg: studentAverage(st, grading),
        missing: grading.filter((a) => (st.scores?.[a._id]?.status ?? 'not_submitted') === 'not_submitted').length,
        pending: columns.filter((a) => cellView(st.scores?.[a._id], a).tone === 'pending').length,
      })),
    [query.data, grading, columns, scope.ids],
  );

  const rows = useMemo(() => {
    const list = q ? all.filter((r) => fold(r.st.student_name).includes(q)) : all;
    const cmp: Record<Sort, (a: StudentRow, b: StudentRow) => number> = {
      high: (a, b) => (b.avg ?? -1) - (a.avg ?? -1),
      low: (a, b) => (a.avg ?? 11) - (b.avg ?? 11),
      missing: (a, b) => b.missing - a.missing || (a.avg ?? 11) - (b.avg ?? 11),
      name: (a, b) => a.st.student_name.localeCompare(b.st.student_name, 'vi'),
    };
    return [...list].sort(cmp[sort]);
  }, [all, q, sort]);

  // Hạng theo điểm TB (cố định, không đổi theo bộ lọc / sắp xếp)
  const rank = useMemo(() => {
    const m = new Map<string, number>();
    [...all]
      .filter((r) => r.avg !== null)
      .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
      .forEach((r, i) => m.set(r.st.student_id, i + 1));
    return m;
  }, [all]);

  const avgs = all.map((r) => r.avg).filter((v): v is number => v !== null);
  const classAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  const bands = BANDS.map((b, i) => ({
    ...b,
    count: avgs.filter((v) => v >= b.min && (i === 0 || v < BANDS[i - 1].min)).length,
  }));
  const totalMissing = all.reduce((n, r) => n + r.missing, 0);
  const totalPending = all.reduce((n, r) => n + r.pending, 0);

  /** Chia sẻ bảng điểm dạng CSV (web: nút Xuất CSV) — mở bảng chia sẻ của máy (Zalo, mail, lưu tệp…). */
  const shareCsv = () => {
    const header = ['Học viên', ...columns.map((a) => a.title), 'Điểm TB'];
    const lines = all.map((r) => [
      r.st.student_name,
      ...columns.map((a) => {
        const v = cellView(r.st.scores?.[a._id], a);
        return v.tone === 'pending' ? '' : v.label;
      }),
      fmt(r.avg),
    ]);
    const csv = [header, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    void Share.share({ title: `Bảng điểm ${cls?.class_code ?? ''}`, message: csv });
  };

  const header = (
    <View className="gap-3.5 pb-3">
      {/* Tổng quan lớp */}
      <View className="gap-3.5 rounded-3xl bg-surface p-4">
        <View className="flex-row items-start gap-3">
          <View className="flex-1">
            <Text className="text-[12px] font-semibold text-muted">{cls?.class_code ?? 'Bảng điểm'}</Text>
            <Text className="text-[16px] font-bold text-foreground" numberOfLines={2}>
              {cls?.display_name || cls?.class_name || 'Bảng điểm lớp'}
            </Text>
          </View>
          <View className="items-end">
            <Text className={`text-[30px] font-extrabold leading-8 ${avgTone(classAvg)}`}>{fmt(classAvg)}</Text>
            <Text className="text-[11.5px] text-muted">Điểm TB lớp</Text>
          </View>
        </View>

        {avgs.length ? (
          <View className="gap-1.5">
            <View className="h-2.5 flex-row overflow-hidden rounded-full bg-surface-muted">
              {bands.map((b) => (b.count ? <View key={b.key} className={`h-full ${b.bar}`} style={{ flex: b.count }} /> : null))}
            </View>
            <View className="flex-row flex-wrap gap-x-3.5 gap-y-1">
              {bands.map((b) => (
                <View key={b.key} className="flex-row items-center gap-1">
                  <View className={`h-2 w-2 rounded-full ${b.bar}`} />
                  <Text className="text-[12px] text-muted">
                    {b.label} <Text className="font-bold text-foreground">{b.count}</Text>
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View className="flex-row gap-2">
          <Mini value={String(all.length)} label="Học viên" />
          <Mini value={String(grading.length)} label="Bài cần chấm" />
          <Mini value={String(totalPending)} label="Chờ chấm" tone={totalPending ? 'warning' : undefined} />
          <Mini value={String(totalMissing)} label="Lượt chưa nộp" tone={totalMissing ? 'danger' : undefined} />
        </View>
        <Text className="text-[11.5px] text-muted">
          Điểm TB chỉ tính bài đã nộp và đã có điểm — bài chưa nộp, chờ chấm, không cần chấm đều bỏ qua.
        </Text>
      </View>

      {/* Góc nhìn */}
      <View className="flex-row rounded-full bg-surface-muted p-1">
        {(
          [
            ['students', `Theo học viên · ${all.length}`],
            ['assignments', `Theo bài tập · ${columns.length}`],
          ] as [View_, string][]
        ).map(([k, label]) => (
          <Pressable
            key={k}
            onPress={() => setView(k)}
            className={`h-9 flex-1 items-center justify-center rounded-full ${view === k ? 'bg-surface' : ''}`}>
            <Text className={`text-[13.5px] font-semibold ${view === k ? 'text-foreground' : 'text-muted'}`}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {view === 'students' ? (
        <>
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
            {search ? (
              <Pressable hitSlop={8} onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color={muted} />
              </Pressable>
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
            {SORTS.map((s) => (
              <Pressable
                key={s.value}
                onPress={() => setSort(s.value)}
                className={`h-8 justify-center rounded-full border px-3.5 ${sort === s.value ? 'border-brand bg-brand-soft' : 'border-border bg-surface'}`}>
                <Text className={`text-[13px] font-semibold ${sort === s.value ? 'text-brand' : 'text-muted'}`}>{s.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen
        options={{
          title: scope.active ? (scope.name ? `Bảng điểm · ${scope.name}` : 'Bảng điểm nhóm') : 'Bảng điểm',
          headerRight: () =>
            query.data ? (
              <Pressable
                onPress={shareCsv}
                hitSlop={8}
                accessibilityLabel="Chia sẻ CSV"
                className="flex-row items-center gap-1 active:opacity-60">
                <Ionicons name="share-outline" size={20} color={brand} />
                <Text className="text-[14px] font-semibold text-brand">CSV</Text>
              </Pressable>
            ) : null,
        }}
      />
      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được bảng điểm"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : !columns.length || !all.length ? (
        <StateView icon="stats-chart-outline" title="Chưa có dữ liệu" description="Lớp chưa có bài tập nào cần chấm điểm." />
      ) : view === 'students' ? (
        <FlashList
          key="students"
          data={rows}
          keyExtractor={(r: StudentRow) => r.st.student_id}
          extraData={expanded}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-2.5" />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          ListEmptyComponent={<StateView icon="search-outline" title="Không tìm thấy học viên" />}
          renderItem={({ item }) => (
            <StudentCard
              row={item}
              rank={rank.get(item.st.student_id)}
              columns={columns}
              open={expanded === item.st.student_id}
              onToggle={() => setExpanded((c) => (c === item.st.student_id ? null : item.st.student_id))}
            />
          )}
        />
      ) : (
        <FlashList
          key="assignments"
          data={columns}
          keyExtractor={(a: GradebookAssignment) => a._id}
          ListHeaderComponent={header}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ItemSeparatorComponent={() => <View className="h-2.5" />}
          refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}
          renderItem={({ item, index }) => <AssignmentCard a={item} index={index} students={all.map((r) => r.st)} />}
        />
      )}
    </View>
  );
}

function Mini({ value, label, tone }: { value: string; label: string; tone?: 'warning' | 'danger' }) {
  return (
    <View className="flex-1 items-center rounded-2xl bg-surface-muted py-2">
      <Text
        className={`text-[16px] font-extrabold ${tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-foreground'}`}>
        {value}
      </Text>
      <Text className="text-center text-[10.5px] text-muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function StudentCard({
  row,
  rank,
  columns,
  open,
  onToggle,
}: {
  row: StudentRow;
  rank?: number;
  columns: GradebookAssignment[];
  open: boolean;
  onToggle: () => void;
}) {
  const muted = useThemeColor('muted');
  const medal = rank && rank <= 3 ? ['#f59e0b', '#9ca3af', '#b45309'][rank - 1] : null;
  return (
    <View className="overflow-hidden rounded-3xl bg-surface">
      <Pressable onPress={onToggle} className="gap-2.5 p-3.5 active:bg-surface-muted">
        <View className="flex-row items-center gap-3">
          <View className="w-7 items-center">
            {medal ? (
              <Ionicons name="medal" size={20} color={medal} />
            ) : (
              <Text className="text-[13px] font-bold text-muted">{rank ?? '–'}</Text>
            )}
          </View>
          <Avatar name={row.st.student_name} size={38} />
          <View className="flex-1">
            <Text className="text-[15px] font-semibold text-foreground" numberOfLines={1}>
              {row.st.student_name}
            </Text>
            <Text className="text-[12px] text-muted" numberOfLines={1}>
              {row.missing ? <Text className="font-semibold text-danger">Chưa nộp {row.missing}</Text> : 'Nộp đủ bài'}
              {row.pending ? ` · chờ chấm ${row.pending}` : ''}
            </Text>
          </View>
          <View className="items-end">
            <Text className={`text-[19px] font-extrabold ${avgTone(row.avg)}`}>{fmt(row.avg)}</Text>
            <Text className="text-[10.5px] text-muted">{row.avg === null ? 'chưa có điểm' : `${Math.round(row.avg * 10)}%`}</Text>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={muted} />
        </View>
        {/* Dải ô màu từng bài — nhìn nhanh bài nào thiếu / thấp */}
        <View className="flex-row flex-wrap gap-1 pl-10">
          {columns.map((a) => (
            <View key={a._id} className={`h-2.5 w-2.5 rounded-[3px] ${CELL[cellView(row.st.scores?.[a._id], a).tone].dot}`} />
          ))}
        </View>
      </Pressable>

      {open ? (
        <View className="gap-1.5 border-t border-border px-3.5 py-3">
          {columns.map((a, i) => {
            const v = cellView(row.st.scores?.[a._id], a);
            return (
              <View key={a._id} className="flex-row items-center gap-3 py-0.5">
                <Text className="w-6 text-[11.5px] font-semibold text-muted">{i + 1}</Text>
                <Text className="flex-1 text-[13.5px] text-foreground" numberOfLines={2}>
                  {a.title}
                </Text>
                <View className={`min-w-[56px] items-center rounded-lg px-2 py-1 ${CELL[v.tone].box}`}>
                  <Text className={`text-[12.5px] font-bold ${CELL[v.tone].text}`}>{v.label}</Text>
                </View>
              </View>
            );
          })}
          <Legend />
        </View>
      ) : null}
    </View>
  );
}

/** Thẻ 1 bài tập: điểm TB bài + phân bố đã chấm / chờ chấm / chưa nộp / không chấm. */
function AssignmentCard({ a, index, students }: { a: GradebookAssignment; index: number; students: GradebookStudent[] }) {
  const views = students.map((st) => ({ v: cellView(st.scores?.[a._id], a), score: st.scores?.[a._id]?.score }));
  const scored = views.filter((x) => ['great', 'good', 'fair', 'low'].includes(x.v.tone)).map((x) => x.score as number);
  const avg = scored.length ? scored.reduce((s, v) => s + v, 0) / scored.length : null;
  const count = (t: CellTone[]) => views.filter((x) => t.includes(x.v.tone)).length;
  const parts: { label: string; n: number; dot: string }[] = [
    { label: 'Đã chấm', n: scored.length, dot: 'bg-success' },
    { label: 'Chờ chấm', n: count(['pending']), dot: 'bg-warning' },
    { label: 'Chưa nộp', n: count(['empty']), dot: 'bg-border' },
    { label: 'Không chấm', n: count(['none']), dot: 'bg-violet' },
  ];
  return (
    <View className="gap-2.5 rounded-3xl bg-surface p-3.5">
      <View className="flex-row items-start gap-3">
        <View className="h-8 w-8 items-center justify-center rounded-xl bg-brand-soft">
          <Text className="text-[13px] font-bold text-brand">{index + 1}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-[14.5px] font-semibold leading-5 text-foreground" numberOfLines={2}>
            {a.title}
          </Text>
          <Text className="text-[11.5px] text-muted">{a.requires_grading === false ? 'Không cần chấm' : `Thang ${a.maxScore || 10}`}</Text>
        </View>
        <View className="items-end">
          <Text className={`text-[19px] font-extrabold ${avgTone(avg)}`}>{fmt(avg)}</Text>
          <Text className="text-[10.5px] text-muted">TB bài</Text>
        </View>
      </View>
      <View className="h-2 flex-row overflow-hidden rounded-full bg-surface-muted">
        {parts.map((p) => (p.n ? <View key={p.label} className={`h-full ${p.dot}`} style={{ flex: p.n }} /> : null))}
      </View>
      <View className="flex-row flex-wrap gap-x-3 gap-y-1">
        {parts
          .filter((p) => p.n)
          .map((p) => (
            <View key={p.label} className="flex-row items-center gap-1">
              <View className={`h-2 w-2 rounded-full ${p.dot}`} />
              <Text className="text-[12px] text-muted">
                {p.label} <Text className="font-bold text-foreground">{p.n}</Text>
              </Text>
            </View>
          ))}
      </View>
    </View>
  );
}

function Legend() {
  const items: { tone: CellTone; label: string }[] = [
    { tone: 'great', label: '≥ 7,5' },
    { tone: 'fair', label: '6 – 7,5' },
    { tone: 'low', label: '< 6' },
    { tone: 'pending', label: 'Chờ chấm' },
    { tone: 'none', label: 'Không chấm' },
    { tone: 'empty', label: 'Chưa nộp' },
  ];
  return (
    <View className="flex-row flex-wrap gap-x-3 gap-y-1 pt-1.5">
      {items.map((i) => (
        <View key={i.label} className="flex-row items-center gap-1">
          <View className={`h-2 w-2 rounded-[2px] ${CELL[i.tone].dot}`} />
          <Text className="text-[11px] text-muted">{i.label}</Text>
        </View>
      ))}
    </View>
  );
}
