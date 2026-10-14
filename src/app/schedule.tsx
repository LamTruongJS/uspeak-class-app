import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { LoadingView, StateView } from '@/components/ui/state-view';
import { useMyClasses } from '@/features/classes/api';
import { useJoinRoom } from '@/features/classes/use-join-room';
import { buildEvents, shortClassName, useStudentSchedule, type EventFilters, type ScheduleEvent } from '@/features/schedule/api';
import { EventRow, type ClassLabel } from '@/features/schedule/event-row';
import { getErrorMessage } from '@/lib/api/client';
import { addDays, isSameDay, startOfDay, startOfWeek, WEEKDAY_FULL } from '@/lib/format';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor } from '@/theme/use-theme-color';

/**
 * Lịch trình học viên. Web có 5 kiểu xem (ngày/tuần/tháng/năm/agenda); trên điện thoại làm như app lịch:
 * dải TUẦN (vuốt trái/phải đổi tuần), bấm tên tháng để mở lưới THÁNG, bên dưới là các sự kiện của ngày
 * đang chọn theo giờ + "Sắp tới" (vài sự kiện kế tiếp) để khỏi phải bấm từng ngày tìm lịch.
 */
const DAY_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const UPCOMING_DAYS = 14;

export default function ScheduleScreen() {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const [today] = useState(() => startOfDay(new Date()));
  // Mốc "bây giờ" cho trạng thái đang học / quá hạn — tự cập nhật mỗi phút
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const [monthOpen, setMonthOpen] = useState(false);
  const [selected, setSelected] = useState(today);
  const [filters, setFilters] = useState<EventFilters>({ classes: true, deadlines: true, redo: true });

  const schedule = useStudentSchedule();
  const classes = useMyClasses();
  const pull = usePullRefresh(() => Promise.all([schedule.refetch(), classes.refetch()]));
  const { join, joiningCode } = useJoinRoom();

  // class_name của lịch là tên nội bộ CRM ("EET22 - 05h00 T246 - 160926") → tra tên hiển thị từ danh sách lớp
  const labels = useMemo(() => {
    const map = new Map<string, ClassLabel>();
    for (const c of classes.data ?? [])
      map.set(c._id, { name: shortClassName(c.display_name || c.class_name, c.class_code), code: c.class_code });
    return map;
  }, [classes.data]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selected);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selected]);

  const monthWeeks = useMemo(() => {
    const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
    const last = new Date(selected.getFullYear(), selected.getMonth() + 1, 0);
    const weeks: Date[][] = [];
    for (let w = startOfWeek(first); w <= last; w = addDays(w, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
    return weeks;
  }, [selected]);

  // Dải ngày cần dữ liệu: trọn lưới đang hiện + 14 ngày sau ngày chọn (cho mục "Sắp tới")
  const eventsByDay = useMemo(() => {
    const from = monthOpen ? monthWeeks[0][0] : weekDays[0];
    const gridEnd = monthOpen ? monthWeeks[monthWeeks.length - 1][6] : weekDays[6];
    const upcomingEnd = addDays(selected, UPCOMING_DAYS);
    const to = gridEnd > upcomingEnd ? gridEnd : upcomingEnd;
    const map = new Map<string, ScheduleEvent[]>();
    for (const ev of buildEvents(schedule.data, from, to, filters)) {
      const k = dayKey(ev.start);
      map.set(k, [...(map.get(k) ?? []), ev]);
    }
    return map;
  }, [schedule.data, filters, monthOpen, monthWeeks, weekDays, selected]);

  const dayEvents = eventsByDay.get(dayKey(selected)) ?? [];

  // "Sắp tới": các sự kiện sau ngày đang chọn (tối đa 5), bỏ bài đã nộp
  const upcoming = useMemo(() => {
    const out: ScheduleEvent[] = [];
    for (let i = 1; i <= UPCOMING_DAYS && out.length < 5; i++) {
      for (const ev of eventsByDay.get(dayKey(addDays(selected, i))) ?? []) {
        if (!ev.done && out.length < 5) out.push(ev);
      }
    }
    return out;
  }, [eventsByDay, selected]);

  const shift = (dir: -1 | 1) => setSelected((d) => (monthOpen ? new Date(d.getFullYear(), d.getMonth() + dir, 1) : addDays(d, dir * 7)));

  // Vuốt ngang trên lịch để đổi tuần / tháng (chạy JS thread — chỉ cần biết hướng vuốt)
  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-24, 24])
    .failOffsetY([-14, 14])
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 50) shift(e.translationX < 0 ? 1 : -1);
    });

  /** Bấm thân thẻ: buổi học → mở chi tiết lớp; hạn nộp → mở bài tập. Vào Zoom có nút riêng. */
  function openEvent(ev: ScheduleEvent) {
    if (ev.type === 'class') {
      if (ev.classId) router.push({ pathname: '/class/[id]', params: { id: ev.classId } });
      else joinClass(ev);
      return;
    }
    if (ev.assignmentId) router.push({ pathname: '/assignment/[id]', params: { id: ev.assignmentId } });
  }

  function joinClass(ev: ScheduleEvent) {
    if (ev.classCode) void join(ev.classCode, ev.zoomLink);
    else if (ev.zoomLink) void Linking.openURL(ev.zoomLink);
  }

  const renderEvent = (ev: ScheduleEvent) => (
    <EventRow
      key={ev.id}
      event={ev}
      now={now}
      label={ev.classId ? labels.get(ev.classId) : undefined}
      joining={!!ev.classCode && joiningCode === ev.classCode}
      onPress={() => openEvent(ev)}
      onJoin={() => joinClass(ev)}
    />
  );

  const isToday = isSameDay(selected, today);

  // Tóm tắt khoảng đang xem — nhìn một dòng biết tuần/tháng này bận cỡ nào, khỏi bấm từng ngày
  const rangeSummary = useMemo(() => {
    const days = monthOpen ? monthWeeks.flat().filter((d) => d.getMonth() === selected.getMonth()) : weekDays;
    let classes = 0;
    let deadlines = 0;
    for (const d of days)
      for (const ev of eventsByDay.get(dayKey(d)) ?? []) {
        if (ev.type === 'class') classes += 1;
        else if (!ev.done) deadlines += 1;
      }
    const parts = [classes ? `${classes} buổi học` : null, deadlines ? `${deadlines} việc cần nộp` : null].filter(Boolean);
    return parts.length ? `${monthOpen ? 'Tháng này' : 'Tuần này'}: ${parts.join(' · ')}` : null;
  }, [eventsByDay, monthOpen, monthWeeks, weekDays, selected]);

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="pb-12"
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={brand} colors={[brand]} />}>
      {/* ── Lịch: tuần / tháng ── */}
      <GestureDetector gesture={swipe}>
        <View className="gap-3 rounded-b-3xl border-b border-border bg-surface px-3 pb-4 pt-3">
          <View className="flex-row items-center gap-1 px-1">
            <Pressable
              onPress={() => setMonthOpen((v) => !v)}
              hitSlop={8}
              accessibilityLabel={monthOpen ? 'Thu gọn về tuần' : 'Mở lịch tháng'}
              className="flex-row items-center gap-1 active:opacity-60">
              <Text className="text-[20px] font-extrabold text-foreground">
                Tháng {selected.getMonth() + 1}
                <Text className="font-semibold text-muted">, {selected.getFullYear()}</Text>
              </Text>
              <Ionicons name={monthOpen ? 'chevron-up' : 'chevron-down'} size={18} color={muted} />
            </Pressable>
            <View className="flex-1" />
            {!isToday ? (
              <Pressable onPress={() => setSelected(today)} className="mr-1 rounded-full bg-brand-soft px-3 py-1.5 active:opacity-70">
                <Text className="text-[13px] font-bold text-brand">Hôm nay</Text>
              </Pressable>
            ) : null}
            <NavButton icon="chevron-back" label="Trước" onPress={() => shift(-1)} />
            <NavButton icon="chevron-forward" label="Sau" onPress={() => shift(1)} />
          </View>

          {monthOpen ? (
            <View className="gap-1">
              <View className="flex-row">
                {DAY_HEADERS.map((d) => (
                  <Text key={d} className="flex-1 text-center text-[11px] font-semibold text-muted">
                    {d}
                  </Text>
                ))}
              </View>
              {/* Chia sẵn từng hàng 7 ô flex-1 — lưới bằng % width bị làm tròn, ô thứ 7 rớt xuống hàng */}
              {monthWeeks.map((week) => (
                <View key={dayKey(week[0])} className="flex-row">
                  {week.map((d) => (
                    <DayCell
                      key={dayKey(d)}
                      date={d}
                      compact
                      selected={isSameDay(d, selected)}
                      today={isSameDay(d, today)}
                      outside={d.getMonth() !== selected.getMonth()}
                      events={eventsByDay.get(dayKey(d))}
                      onPress={() => setSelected(d)}
                    />
                  ))}
                </View>
              ))}
            </View>
          ) : (
            <View className="flex-row gap-1">
              {weekDays.map((d, i) => (
                <DayCell
                  key={dayKey(d)}
                  date={d}
                  weekday={DAY_HEADERS[i]}
                  selected={isSameDay(d, selected)}
                  today={isSameDay(d, today)}
                  events={eventsByDay.get(dayKey(d))}
                  onPress={() => setSelected(d)}
                />
              ))}
            </View>
          )}

          {rangeSummary ? <Text className="text-center text-[12.5px] font-medium text-muted">{rangeSummary}</Text> : null}

          <View className="flex-row justify-center gap-2">
            <FilterChip
              label="Buổi học"
              dot="bg-info"
              on={filters.classes}
              onPress={() => setFilters((f) => ({ ...f, classes: !f.classes }))}
            />
            <FilterChip
              label="Hạn nộp"
              dot="bg-danger"
              on={filters.deadlines}
              onPress={() => setFilters((f) => ({ ...f, deadlines: !f.deadlines }))}
            />
            <FilterChip label="Làm lại" dot="bg-violet" on={filters.redo} onPress={() => setFilters((f) => ({ ...f, redo: !f.redo }))} />
          </View>
        </View>
      </GestureDetector>

      {/* ── Sự kiện của ngày chọn ── */}
      <View className="gap-3 px-4 pt-5">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-[17px] font-bold text-foreground">
            {isToday ? 'Hôm nay' : WEEKDAY_FULL[selected.getDay()]}
            <Text className="font-semibold text-muted">
              {' '}
              · {selected.getDate()}/{selected.getMonth() + 1}
            </Text>
          </Text>
          {dayEvents.length ? <Text className="text-[13px] text-muted">{dayEvents.length} sự kiện</Text> : null}
        </View>

        {schedule.isLoading ? (
          <LoadingView />
        ) : schedule.isError ? (
          <StateView
            icon="cloud-offline-outline"
            title="Không tải được lịch"
            description={getErrorMessage(schedule.error)}
            actionLabel="Thử lại"
            onAction={() => schedule.refetch()}
          />
        ) : dayEvents.length === 0 ? (
          <View className="items-center gap-1.5 rounded-2xl border border-dashed border-border px-4 py-6">
            <Ionicons name="cafe-outline" size={26} color={muted} />
            <Text className="text-[14.5px] font-semibold text-foreground">Không có lịch</Text>
            <Text className="text-center text-[13px] text-muted">Ngày này không có buổi học hay hạn nộp bài nào.</Text>
          </View>
        ) : (
          dayEvents.map(renderEvent)
        )}
      </View>

      {/* ── Sắp tới ── */}
      {!schedule.isLoading && upcoming.length ? (
        <View className="gap-3 px-4 pt-7">
          <Text className="text-[17px] font-bold text-foreground">Sắp tới</Text>
          {upcoming.map((ev, i) => {
            const showDay = i === 0 || !isSameDay(ev.start, upcoming[i - 1].start);
            return (
              <View key={ev.id} className="gap-2">
                {showDay ? (
                  <Pressable onPress={() => setSelected(startOfDay(ev.start))} className="active:opacity-60">
                    <Text className="text-[12.5px] font-bold uppercase tracking-wide text-muted">{dayLabel(ev.start, today)}</Text>
                  </Pressable>
                ) : null}
                {renderEvent(ev)}
              </View>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

/** "Ngày mai · 15/10" / "Thứ sáu · 16/10" */
function dayLabel(d: Date, today: Date) {
  const name = isSameDay(d, addDays(today, 1)) ? 'Ngày mai' : WEEKDAY_FULL[d.getDay()];
  return `${name} · ${d.getDate()}/${d.getMonth() + 1}`;
}

function NavButton({ icon, label, onPress }: { icon: 'chevron-back' | 'chevron-forward'; label: string; onPress: () => void }) {
  const fg = useThemeColor('foreground');
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={label}
      className="h-9 w-9 items-center justify-center rounded-full bg-surface-muted active:opacity-60">
      <Ionicons name={icon} size={18} color={fg} />
    </Pressable>
  );
}

/**
 * 1 ngày trên lịch. Tuần: viên thuốc cao có thứ + ngày; tháng (`compact`): ô tròn. Chấm màu bên dưới
 * = có buổi học (xanh) / hạn nộp (đỏ) / làm lại (tím); hạn đã nộp hết thì không chấm đỏ.
 */
function DayCell({
  date,
  weekday,
  selected,
  today,
  outside,
  compact,
  events,
  onPress,
}: {
  date: Date;
  weekday?: string;
  selected: boolean;
  today: boolean;
  outside?: boolean;
  compact?: boolean;
  events?: ScheduleEvent[];
  onPress: () => void;
}) {
  const types = new Set((events ?? []).filter((e) => !e.done).map((e) => e.type));
  const dots = (
    <View className="h-1.5 flex-row gap-0.5">
      {types.has('class') ? <View className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-white' : 'bg-info'}`} /> : null}
      {types.has('deadline') ? <View className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-white/80' : 'bg-danger'}`} /> : null}
      {types.has('redo') ? <View className={`h-1.5 w-1.5 rounded-full ${selected ? 'bg-white/70' : 'bg-violet'}`} /> : null}
    </View>
  );
  const numberClass = selected ? 'text-on-brand' : today ? 'text-brand' : outside ? 'text-muted opacity-50' : 'text-foreground';

  if (compact) {
    return (
      <Pressable onPress={onPress} className="flex-1 items-center gap-0.5 py-1">
        <View className={`h-9 w-9 items-center justify-center rounded-full ${selected ? 'bg-brand' : today ? 'bg-brand-soft' : ''}`}>
          <Text className={`text-[14px] font-bold ${numberClass}`}>{date.getDate()}</Text>
        </View>
        <View className="h-1.5 flex-row gap-0.5">
          {types.has('class') ? <View className="h-1.5 w-1.5 rounded-full bg-info" /> : null}
          {types.has('deadline') ? <View className="h-1.5 w-1.5 rounded-full bg-danger" /> : null}
          {types.has('redo') ? <View className="h-1.5 w-1.5 rounded-full bg-violet" /> : null}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected }}
      className={`flex-1 items-center gap-1 rounded-2xl py-2.5 active:opacity-70 ${selected ? 'bg-brand' : today ? 'bg-brand-soft' : ''}`}>
      <Text className={`text-[11.5px] font-semibold ${selected ? 'text-on-brand opacity-80' : today ? 'text-brand' : 'text-muted'}`}>
        {weekday}
      </Text>
      <Text className={`text-[18px] font-extrabold ${numberClass}`}>{date.getDate()}</Text>
      {dots}
    </Pressable>
  );
}

function FilterChip({ label, dot, on, onPress }: { label: string; dot: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      className={`h-8 flex-row items-center gap-1.5 rounded-full px-3 active:opacity-70 ${on ? 'bg-surface-muted' : 'bg-transparent opacity-40'}`}>
      <View className={`h-2 w-2 rounded-full ${dot}`} />
      <Text className="text-[12.5px] font-semibold text-foreground">{label}</Text>
    </Pressable>
  );
}
