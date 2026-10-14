import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useMemo, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoadingView, StateView } from '@/components/ui/state-view';
import { scheduleParts } from '@/features/classes/next-session';
import { api, getErrorMessage } from '@/lib/api/client';
import { formatDate } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Đăng kí lớp UspeakPro — bản mobile của web /course-privileges (luật copy từ
 * uspeak-class-fe course-privileges/page.tsx, sửa luật thì sửa cả hai bên).
 *
 * Gói PRO cho học viên một số LƯỢT chọn lớp theo từng khoá (`granted_course_groups[].max_selections`).
 * Luồng giống web: chọn nhiều lớp → bấm "Đăng ký" 1 lần. Không dính thanh toán (gói đã trả tiền) nên
 * đưa vào app được.
 *
 * Bẫy (xem docs/HANDOFF.md):
 * - CRM trả `granted_classes` KHÔNG lọc trùng → dedupe theo `_id`.
 * - `course_summary.total_registered` là lượt đăng ký của TOÀN BỘ học viên (VD "137/2") → không dùng;
 *   lượt đã dùng = số lớp CHÍNH MÌNH đã đăng ký trong cùng group.
 * - Lớp CLOSED_REGISTRATION mà mình chưa đăng ký thì ẩn; lớp đầy (student_count ≥ max_students) không chọn được.
 * - Trạng thái trong CANCEL_LOCKED: không tự huỷ được (đã xác nhận / đang học…).
 */
interface GrantedClass {
  _id: string;
  class_code: string;
  class_name: string;
  course_name: string;
  course_code: string;
  teacher_name: string;
  class_time: string;
  duration?: number;
  start_date: string;
  end_date: string;
  status_class: string;
  registered: boolean;
  consultation_status?: string | null;
  student_count: number;
  max_students: number | null;
}

interface CourseGroup {
  course_id: string;
  max_selections: number;
  class_ids: string[];
}

interface ComboClass {
  class_code: string;
  class_name: string;
  class_id: string;
  course_name: string;
  granted_classes: GrantedClass[];
  granted_course_groups?: CourseGroup[];
}

const CANCEL_LOCKED: Record<string, string> = {
  PAYMENT_CONFIRMED: 'Đã xác nhận',
  ACTIVE: 'Đang học',
  COMPLETED: 'Đã hoàn thành',
  RETURNED_DEFERRED: 'Đã quay lại sau bảo lưu',
  TRANSFERRED: 'Đã chuyển lớp',
};

const isFull = (c: GrantedClass) => typeof c.max_students === 'number' && c.student_count >= c.max_students;

interface CourseBlock {
  key: string;
  name: string;
  /** index group quyết định số lượt (group ĐẦU TIÊN chứa lớp — giống web) */
  group: number | null;
  max: number;
  classes: GrantedClass[];
}

interface Combo {
  code: string;
  title: string;
  classes: GrantedClass[];
  groups: CourseGroup[];
  classToGroup: Map<string, number>;
  courses: CourseBlock[];
}

/** Chuẩn hoá giống normalizeCombos của web. */
function normalize(raw: ComboClass[]): Combo[] {
  const seenCombo = new Set<string>();
  const out: Combo[] = [];
  for (const combo of raw) {
    const key = combo?.class_id || combo?.class_code;
    if (!key || seenCombo.has(key)) continue;
    seenCombo.add(key);

    const seen = new Set<string>();
    const classes: GrantedClass[] = [];
    for (const c of combo.granted_classes ?? []) {
      if (!c?._id || seen.has(c._id)) continue;
      if (c.status_class === 'CLOSED_REGISTRATION' && !c.registered) continue;
      seen.add(c._id);
      classes.push(c);
    }
    if (!classes.length) continue;

    const groups = (combo.granted_course_groups ?? []).map((g) => ({
      ...g,
      max_selections: g.max_selections || 1,
      class_ids: Array.from(new Set(g.class_ids ?? [])).filter((id) => seen.has(id)),
    }));
    const classToGroup = new Map<string, number>();
    groups.forEach((g, i) => g.class_ids.forEach((id) => !classToGroup.has(id) && classToGroup.set(id, i)));

    const byCourse = new Map<string, CourseBlock>();
    for (const c of classes) {
      const k = c.course_code || c.course_name || c._id;
      if (!byCourse.has(k)) {
        const g = classToGroup.get(c._id);
        byCourse.set(k, {
          key: k,
          name: c.course_name || 'Khoá học',
          group: g ?? null,
          max: g !== undefined ? groups[g].max_selections : 1,
          classes: [],
        });
      }
      byCourse.get(k)!.classes.push(c);
    }
    // Lớp khai giảng sớm lên trước — học viên thường chọn theo ngày bắt đầu
    const courses = [...byCourse.values()].map((b) => ({
      ...b,
      classes: [...b.classes].sort((a, z) => (a.start_date || '').localeCompare(z.start_date || '')),
    }));

    out.push({ code: combo.class_code, title: combo.course_name || combo.class_name, classes, groups, classToGroup, courses });
  }
  return out;
}

/** Cảnh báo lịch dày — giống buildScheduleWarning của web. */
function scheduleWarning(classes: GrantedClass[]) {
  if (classes.length < 2) return null;
  const byDay = new Map<string, number>();
  let sessions = 0;
  for (const c of classes) {
    const p = scheduleParts(c.class_time);
    p?.days.forEach((d) => byDay.set(d, (byDay.get(d) ?? 0) + 1));
    sessions += p?.days.length ?? 0;
  }
  const busy = [...byDay.entries()].filter(([, n]) => n >= 2).map(([d]) => d);
  if (busy.length) return `Bạn có từ 2 lớp trong cùng ngày (${busy.join(', ')}). Cân nhắc sức học và thời gian làm bài nhé.`;
  if (sessions >= 6) return `Các lớp này có khoảng ${sessions} buổi mỗi tuần — lịch khá dày.`;
  return null;
}

type Tab = 'pick' | 'mine';

export default function ProRegisterScreen() {
  const brand = useThemeColor('brand');
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('pick');
  /** classId → mã gói (đăng ký gửi theo từng gói) */
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [cancelling, setCancelling] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['combo', 'my-combo-classes'],
    queryFn: async () => (await api.get<{ data: ComboClass[] | null }>('/classes/my-combo-classes')).data.data ?? [],
  });
  const pull = usePullRefresh(() => query.refetch());
  const combos = useMemo(() => normalize(query.data ?? []), [query.data]);

  const register = useMutation({
    mutationFn: (input: { classCode: string; selectedClassIds: string[] }) => api.post('/classes/combo/register', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['combo'] }),
  });
  const cancel = useMutation({
    mutationFn: (input: { classCode: string; classId: string }) => api.post('/classes/combo/cancel', input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['combo'] }),
  });

  // Lựa chọn còn hợp lệ theo dữ liệu MỚI NHẤT (lớp vừa được đăng ký ở nơi khác / vừa đầy thì tự rơi ra) —
  // suy ra khi render thay vì dọn trong effect.
  const allClasses = useMemo(() => new Map(combos.flatMap((c) => c.classes.map((x) => [x._id, x] as const))), [combos]);
  const selected = Object.keys(picked).filter((id) => {
    const c = allClasses.get(id);
    return c && !c.registered && !isFull(c);
  });

  /** Lượt đã dùng (đã đăng ký + đang chọn) trong 1 group */
  const usedIn = (combo: Combo, group: number | null) =>
    group === null
      ? 0
      : combo.classes.filter((c) => combo.classToGroup.get(c._id) === group && (c.registered || selected.includes(c._id))).length;
  const registeredUsed = (combo: Combo, group: number | null) =>
    group === null ? 0 : combo.classes.filter((c) => combo.classToGroup.get(c._id) === group && c.registered).length;

  function toggle(combo: Combo, c: GrantedClass) {
    if (picked[c._id]) {
      setPicked(({ [c._id]: _drop, ...rest }) => rest);
      return;
    }
    const g = combo.classToGroup.get(c._id);
    if (g !== undefined && usedIn(combo, g) >= combo.groups[g].max_selections) {
      Alert.alert(
        'Đã đủ lượt chọn',
        `Khoá ${c.course_name} chỉ được chọn ${combo.groups[g].max_selections} lớp. Bỏ chọn một lớp khác (hoặc huỷ lớp đã đăng ký) rồi chọn lại nhé.`,
      );
      return;
    }
    setPicked((p) => ({ ...p, [c._id]: combo.code }));
  }

  function confirmRegister() {
    const list = selected.map((id) => allClasses.get(id)!);
    const mine = combos.flatMap((c) => c.classes.filter((x) => x.registered));
    const warn = scheduleWarning([...mine, ...list]);
    const lines = list.map((c) => `• ${c.course_name} – ${c.class_code}${c.class_time ? ` (${c.class_time})` : ''}`).join('\n');
    Alert.alert(
      `Đăng ký ${list.length} lớp?`,
      `${lines}${warn ? `\n\n⚠️ ${warn}` : ''}\n\nLớp nằm trong gói UspeakPro nên không mất thêm phí.`,
      [
        { text: 'Xem lại', style: 'cancel' },
        { text: 'Đăng ký', onPress: () => void submit() },
      ],
    );
  }

  async function submit() {
    const byCombo = new Map<string, string[]>();
    selected.forEach((id) => byCombo.set(picked[id], [...(byCombo.get(picked[id]) ?? []), id]));
    try {
      for (const [classCode, ids] of byCombo) await register.mutateAsync({ classCode, selectedClassIds: ids });
      setPicked({});
      setTab('mine');
      Alert.alert('Đăng ký thành công', 'Lớp đã chuyển sang mục "Đã đăng ký". Trung tâm sẽ xác nhận và xếp bạn vào lớp.');
    } catch (err) {
      Alert.alert('Đăng ký chưa thành công', getErrorMessage(err));
    }
  }

  function confirmCancel(combo: Combo, c: GrantedClass) {
    Alert.alert('Huỷ đăng ký lớp này?', `${c.course_name} – ${c.class_code}\nLượt chọn sẽ được trả lại để bạn chọn lớp khác.`, [
      { text: 'Không', style: 'cancel' },
      {
        text: 'Huỷ đăng ký',
        style: 'destructive',
        onPress: async () => {
          setCancelling(c._id);
          try {
            await cancel.mutateAsync({ classCode: combo.code, classId: c._id });
          } catch (err) {
            Alert.alert('Chưa huỷ được', getErrorMessage(err));
          } finally {
            setCancelling(null);
          }
        },
      },
    ]);
  }

  const registeredCount = combos.reduce((n, c) => n + c.classes.filter((x) => x.registered).length, 0);
  const availableCount = combos.reduce((n, c) => n + c.classes.filter((x) => !x.registered).length, 0);

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ title: 'Đăng kí lớp UspeakPro' }} />
      {query.isLoading ? (
        <LoadingView />
      ) : query.isError ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được gói UspeakPro"
          description={getErrorMessage(query.error)}
          actionLabel="Thử lại"
          onAction={() => query.refetch()}
        />
      ) : combos.length === 0 ? (
        <StateView
          icon="star-outline"
          title="Bạn chưa có gói UspeakPro"
          description="Khi bạn mua gói UspeakPro, các khoá trong gói sẽ hiện ở đây để bạn tự chọn lớp."
        />
      ) : (
        <>
          <ScrollView
            contentContainerClassName="gap-4 p-4"
            contentContainerStyle={{ paddingBottom: selected.length ? 120 + insets.bottom : 32 }}
            refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
            {combos.map((combo) => (
              <QuotaCard key={combo.code} combo={combo} used={(g) => registeredUsed(combo, g)} />
            ))}

            <View className="flex-row rounded-full bg-surface-muted p-1">
              <TabButton label="Chọn lớp" count={availableCount} on={tab === 'pick'} onPress={() => setTab('pick')} />
              <TabButton label="Đã đăng ký" count={registeredCount} on={tab === 'mine'} onPress={() => setTab('mine')} />
            </View>

            {tab === 'pick' ? (
              availableCount === 0 ? (
                <StateView icon="checkmark-done-outline" title="Không còn lớp nào đang mở đăng ký" />
              ) : (
                combos.map((combo) =>
                  combo.courses.map((course) => {
                    const open = course.classes.filter((c) => !c.registered);
                    if (!open.length) return null;
                    const left = Math.max(0, course.max - usedIn(combo, course.group));
                    return (
                      <View key={`${combo.code}-${course.key}`} className="gap-2.5">
                        <View className="flex-row items-center gap-2 px-1 pt-1">
                          <Text className="flex-1 text-[15px] font-bold text-foreground" numberOfLines={1}>
                            {course.name}
                          </Text>
                          <View className={`rounded-full px-2.5 py-1 ${left > 0 ? 'bg-success-soft' : 'bg-surface-muted'}`}>
                            <Text className={`text-[12px] font-bold ${left > 0 ? 'text-success' : 'text-muted'}`}>
                              {left > 0 ? `Còn ${left} lượt chọn` : 'Đã dùng hết lượt'}
                            </Text>
                          </View>
                        </View>
                        {open.map((c) => {
                          const on = !!picked[c._id] && selected.includes(c._id);
                          const lock = isFull(c) ? 'Lớp đã đủ học viên' : !on && left === 0 ? 'Đã dùng hết lượt của khoá này' : null;
                          return <PickCard key={c._id} cls={c} selected={on} lock={lock} onPress={() => toggle(combo, c)} />;
                        })}
                      </View>
                    );
                  }),
                )
              )
            ) : registeredCount === 0 ? (
              <StateView icon="school-outline" title="Bạn chưa đăng ký lớp nào" description="Chọn lớp ở mục “Chọn lớp” rồi bấm Đăng ký." />
            ) : (
              <View className="gap-2.5">
                {combos.flatMap((combo) =>
                  combo.classes
                    .filter((c) => c.registered)
                    .map((c) => (
                      <RegisteredCard key={c._id} cls={c} busy={cancelling === c._id} onCancel={() => confirmCancel(combo, c)} />
                    )),
                )}
              </View>
            )}
          </ScrollView>

          {selected.length ? (
            <View
              className="absolute bottom-0 left-0 right-0 border-t border-border bg-surface px-4 pt-3"
              style={{ paddingBottom: insets.bottom + 12 }}>
              <View className="flex-row items-center gap-3">
                <View className="flex-1">
                  <Text className="text-[15px] font-bold text-foreground">Đã chọn {selected.length} lớp</Text>
                  <Text className="text-[12.5px] text-success">Trong gói UspeakPro · không mất thêm phí</Text>
                </View>
                <Pressable
                  onPress={confirmRegister}
                  disabled={register.isPending}
                  className="h-12 flex-row items-center gap-2 rounded-2xl bg-brand px-6 active:opacity-85">
                  {register.isPending ? <ActivityIndicator color="#fff" /> : <Ionicons name="checkmark-circle" size={19} color="#fff" />}
                  <Text className="text-[15px] font-bold text-white">Đăng ký</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

/** Thẻ đầu trang: tên gói + số lượt đã dùng của từng khoá. */
function QuotaCard({ combo, used }: { combo: Combo; used: (group: number | null) => number }) {
  return (
    <View className="gap-3 overflow-hidden rounded-3xl bg-brand p-4">
      <View className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/10" />
      <View className="flex-row items-center gap-2.5">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-white/20">
          <Ionicons name="star" size={20} color="#fff" />
        </View>
        <View className="flex-1">
          <Text className="text-[12px] font-semibold text-white/80">Gói UspeakPro · {combo.code}</Text>
          <Text className="text-[16px] font-bold text-white" numberOfLines={2}>
            {combo.title}
          </Text>
        </View>
      </View>
      <View className="gap-2 rounded-2xl bg-white/15 p-3">
        <Text className="text-[12px] font-semibold text-white/85">Lượt chọn lớp của bạn</Text>
        {combo.courses.map((c) => {
          const u = Math.min(used(c.group), c.max);
          return (
            <View key={c.key} className="gap-1">
              <View className="flex-row items-center justify-between">
                <Text className="flex-1 text-[13.5px] font-semibold text-white" numberOfLines={1}>
                  {c.name}
                </Text>
                <Text className="text-[13px] font-bold text-white">
                  {u}/{c.max}
                </Text>
              </View>
              <View className="h-1.5 overflow-hidden rounded-full bg-white/25">
                <View className="h-full rounded-full bg-white" style={{ width: `${(u / Math.max(1, c.max)) * 100}%` }} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function TabButton({ label, count, on, onPress }: { label: string; count: number; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      className={`h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-full ${on ? 'bg-surface' : ''}`}>
      <Text className={`text-[14px] font-semibold ${on ? 'text-foreground' : 'text-muted'}`}>{label}</Text>
      <View className={`rounded-full px-1.5 ${on ? 'bg-brand' : 'bg-border'}`}>
        <Text className={`text-[11px] font-bold ${on ? 'text-on-brand' : 'text-muted'}`}>{count}</Text>
      </View>
    </Pressable>
  );
}

function ClassInfo({ cls }: { cls: GrantedClass }) {
  const muted = useThemeColor('muted');
  const p = scheduleParts(cls.class_time);
  const seats = typeof cls.max_students === 'number' ? Math.max(0, cls.max_students - cls.student_count) : null;
  const rows: { icon: ComponentProps<typeof Ionicons>['name']; text: string }[] = [
    { icon: 'time-outline', text: p ? `${p.days.join(' · ')}  ·  ${p.time}` : cls.class_time || 'Chưa có lịch' },
    { icon: 'person-outline', text: cls.teacher_name ? `GV ${cls.teacher_name}` : 'Chưa phân giáo viên' },
  ];
  return (
    <View className="gap-1.5">
      {rows.map((r) => (
        <View key={r.icon} className="flex-row items-center gap-2">
          <Ionicons name={r.icon} size={15} color={muted} />
          <Text className="flex-1 text-[13.5px] text-foreground" numberOfLines={1}>
            {r.text}
          </Text>
        </View>
      ))}
      <View className="flex-row items-center gap-2">
        <Ionicons name="people-outline" size={15} color={muted} />
        <Text className="text-[13.5px] text-foreground">
          {cls.duration ? `${cls.duration} buổi · ` : ''}
          {seats === null ? `${cls.student_count} học viên` : seats > 0 ? `Còn ${seats} chỗ` : 'Đã đủ học viên'}
        </Text>
      </View>
    </View>
  );
}

/** Ô ngày khai giảng to bên trái thẻ — thứ học viên nhìn đầu tiên khi chọn lớp. */
function StartBadge({ date, tone }: { date?: string; tone: 'brand' | 'muted' | 'success' }) {
  const d = date ? new Date(date) : null;
  const box = tone === 'brand' ? 'bg-brand-soft' : tone === 'success' ? 'bg-success-soft' : 'bg-surface-muted';
  const text = tone === 'brand' ? 'text-brand' : tone === 'success' ? 'text-success' : 'text-muted';
  return (
    <View className={`h-16 w-16 items-center justify-center rounded-2xl ${box}`}>
      {d && !Number.isNaN(d.getTime()) ? (
        <>
          <Text className={`text-[10.5px] font-semibold ${text}`}>Khai giảng</Text>
          <Text className={`text-[19px] font-extrabold leading-6 ${text}`}>{String(d.getDate()).padStart(2, '0')}</Text>
          <Text className={`text-[11px] font-semibold ${text}`}>th{d.getMonth() + 1}</Text>
        </>
      ) : (
        <Ionicons name="calendar-outline" size={22} color="#9ca3af" />
      )}
    </View>
  );
}

function PickCard({ cls, selected, lock, onPress }: { cls: GrantedClass; selected: boolean; lock: string | null; onPress: () => void }) {
  const onBrand = useThemeColor('on-brand');
  return (
    <Pressable
      onPress={onPress}
      disabled={!!lock && !selected}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected, disabled: !!lock && !selected }}
      className={`gap-3 rounded-3xl border-2 bg-surface p-3.5 active:opacity-90 ${selected ? 'border-brand' : 'border-transparent'} ${
        lock && !selected ? 'opacity-55' : ''
      }`}>
      <View className="flex-row gap-3">
        <StartBadge date={cls.start_date} tone={selected ? 'brand' : 'muted'} />
        <View className="flex-1 gap-1.5">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-[16px] font-bold text-foreground">{cls.class_code}</Text>
            <View
              className={`h-7 w-7 items-center justify-center rounded-full border-2 ${selected ? 'border-brand bg-brand' : 'border-border'}`}>
              {selected ? <Ionicons name="checkmark" size={16} color={onBrand} /> : null}
            </View>
          </View>
          <ClassInfo cls={cls} />
        </View>
      </View>
      {lock ? (
        <View className="flex-row items-center gap-1.5 rounded-xl bg-surface-muted px-3 py-2">
          <Ionicons name="lock-closed" size={13} color="#9ca3af" />
          <Text className="text-[12.5px] font-medium text-muted">{lock}</Text>
        </View>
      ) : cls.start_date ? (
        <Text className="text-[12px] text-muted">
          Học từ {formatDate(cls.start_date)}
          {cls.end_date ? ` đến ${formatDate(cls.end_date)}` : ''}
        </Text>
      ) : null}
    </Pressable>
  );
}

function RegisteredCard({ cls, busy, onCancel }: { cls: GrantedClass; busy: boolean; onCancel: () => void }) {
  const locked = cls.consultation_status ? CANCEL_LOCKED[cls.consultation_status] : undefined;
  return (
    <View className="gap-3 rounded-3xl bg-surface p-3.5">
      <View className="flex-row gap-3">
        <StartBadge date={cls.start_date} tone="success" />
        <View className="flex-1 gap-1.5">
          <View className="flex-row items-center gap-2">
            <Text className="flex-1 text-[16px] font-bold text-foreground" numberOfLines={1}>
              {cls.class_code}
            </Text>
            <View className="rounded-full bg-success-soft px-2 py-0.5">
              <Text className="text-[11.5px] font-bold text-success">{locked ?? 'Đã đăng ký'}</Text>
            </View>
          </View>
          <Text className="text-[12.5px] font-semibold text-muted" numberOfLines={1}>
            {cls.course_name}
          </Text>
          <ClassInfo cls={cls} />
        </View>
      </View>
      {locked ? null : (
        <Pressable
          onPress={onCancel}
          disabled={busy}
          className="h-10 flex-row items-center justify-center gap-1.5 rounded-xl bg-surface-muted active:opacity-70">
          {busy ? <ActivityIndicator size="small" /> : null}
          <Text className="text-[13.5px] font-semibold text-danger">Huỷ đăng ký</Text>
        </Pressable>
      )}
    </View>
  );
}
