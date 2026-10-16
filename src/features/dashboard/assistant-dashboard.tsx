import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { StateView } from '@/components/ui/state-view';
import { ASSISTANT_DASHBOARD_3D_ICONS } from '@/constants/three-d-icons';
import { useGradingSummary } from '@/features/assignments/grading-api';
import { getErrorMessage } from '@/lib/api/client';
import { WEEKDAY_FULL, formatTime } from '@/lib/format';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

import {
  sessionLabel,
  useAssistantDashboard,
  type AssistantAttentionStudent,
  type AssistantDashboardGroup,
  type AssistantRecentSession,
  type AssistantUpcomingSession,
  type AttentionReasonCode,
} from './assistant-api';
import { DashboardHeader } from './dashboard-header';

/**
 * Trang chủ TRỢ GIẢNG — bản mobile của uspeak-class-fe dashboard/AssistantDashboard.tsx (cùng endpoint
 * GET /classes/assistant-dashboard). Khác dashboard admin: chỉ nói về các nhóm mình hỗ trợ và việc cần
 * làm với từng học viên — ai thiếu bài quá hạn, ai vắng buổi gần đây, buổi học sắp tới.
 */

const REASON_TONE: Record<AttentionReasonCode, BadgeTone> = {
  absent: 'danger',
  overdue: 'warning',
  attendance: 'warning',
  score: 'violet',
};

type Filter = 'all' | 'overdue' | 'absent';

const pad = (n: number) => String(n).padStart(2, '0');
const dayOf = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

function greeting(hour: number) {
  if (hour < 12) return 'Chào buổi sáng';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

/** "Hôm nay · 16/10" / "Ngày mai · 17/10" / "Thứ hai · 19/10" — `now` truyền vào (React Compiler cấm Date.now() lúc render). */
function dayLabel(d: Date, now: number) {
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return `Hôm nay · ${dayOf(d)}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Ngày mai · ${dayOf(d)}`;
  return `${WEEKDAY_FULL[d.getDay()]} · ${dayOf(d)}`;
}

export function AssistantDashboard({ shortcuts }: { shortcuts: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const [now] = useState(() => Date.now());
  const dashboard = useAssistantDashboard();
  const queue = useGradingSummary(true);
  const d = dashboard.data;

  return (
    <View className="gap-4">
      <DashboardHeader
        user={user}
        greeting={greeting(new Date(now).getHours())}
        eyebrow="Không gian trợ giảng"
        description={d ? `Bạn đang hỗ trợ ${d.summary.groups} nhóm · ${d.summary.classes} lớp` : 'Theo dõi các nhóm bạn hỗ trợ'}
        icon="people">
        <View className="flex-row gap-2">
          <HeroPill value={d?.summary.students} label="Học viên" color="#ffffff" />
          <HeroPill value={d?.summary.attention_students} label="Cần chú ý" color="#fcd34d" />
          <HeroPill value={d?.summary.overdue_submissions} label="Bài quá hạn" color="#fecdd3" />
        </View>
      </DashboardHeader>

      {dashboard.isLoading ? (
        <ActivityIndicator className="py-10" />
      ) : dashboard.isError || !d ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được trang chủ"
          description={getErrorMessage(dashboard.error)}
          actionLabel="Thử lại"
          onAction={() => void dashboard.refetch()}
        />
      ) : (
        <>
          <NextSessionCard session={d.upcoming_sessions[0]} now={now} />

          <View className="flex-row gap-2.5">
            <QuickStat
              icon3d={ASSISTANT_DASHBOARD_3D_ICONS.pendingGrading}
              value={queue.data?.total}
              label="Chờ nhận xét"
              sub={queue.data?.urgent ? `${queue.data.urgent} bài gấp` : 'Không có bài gấp'}
              subDanger={!!queue.data?.urgent}
              onPress={() => router.navigate('/assignments')}
            />
            <QuickStat
              icon3d={ASSISTANT_DASHBOARD_3D_ICONS.groups}
              value={d.summary.groups}
              label="Nhóm hỗ trợ"
              sub={`${d.summary.students} học viên`}
              onPress={() => router.push('/teach/groups')}
            />
          </View>

          {shortcuts}

          <AttentionSection students={d.attention} total={d.summary.attention_students} />
          <UpcomingSection sessions={d.upcoming_sessions} now={now} />
          <RecentSection sessions={d.recent_sessions} />

          <SectionTitle icon="people" title="Nhóm bạn hỗ trợ" />
          {d.groups.length ? (
            <View className="gap-2.5">
              {d.groups.map((g) => (
                <GroupCard key={g.group_id} group={g} />
              ))}
            </View>
          ) : (
            <StateView icon="people-outline" title="Bạn chưa được phân nhóm nào" description="Khi được phân công hỗ trợ lớp, nhóm sẽ hiện ở đây." />
          )}
        </>
      )}
    </View>
  );
}

// ─── Khối con ────────────────────────────────────────────────────────────────

const HERO_SHADOW = { textShadowColor: 'rgba(0, 0, 0, 0.75)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 };

function HeroPill({ value, label, color }: { value?: number; label: string; color: string }) {
  return (
    <View className="flex-1 items-center rounded-xl border border-white/25 bg-black/30 px-1.5 py-2.5">
      <Text className="text-xl font-extrabold" style={[{ color }, HERO_SHADOW]}>
        {value === undefined ? '–' : value.toLocaleString('vi-VN')}
      </Text>
      <Text className="text-center text-[9px] font-bold uppercase leading-3 tracking-wide text-white" style={HERO_SHADOW}>
        {label}
      </Text>
    </View>
  );
}

function SectionTitle({ icon, title, right }: { icon: ComponentProps<typeof Ionicons>['name']; title: string; right?: ReactNode }) {
  const brand = useThemeColor('brand');
  return (
    <View className="-mb-1 flex-row items-center gap-2">
      <Ionicons name={icon} size={16} color={brand} />
      <Text className="flex-1 text-[15px] font-bold text-foreground">{title}</Text>
      {right}
    </View>
  );
}

function NextSessionCard({ session, now }: { session?: AssistantUpcomingSession; now: number }) {
  const start = session ? new Date(session.start) : null;
  return (
    <Pressable
      disabled={!session}
      onPress={() => session && router.push({ pathname: '/teach/[id]', params: { id: session.class_id } })}
      className={`flex-row items-center gap-3 rounded-2xl border p-3.5 active:opacity-80 ${
        session?.live ? 'border-danger bg-danger-soft' : 'border-border bg-surface'
      }`}>
      <Image source={ASSISTANT_DASHBOARD_3D_ICONS.schedule} style={{ width: 46, height: 46 }} contentFit="contain" accessible={false} />
      <View className="min-w-0 flex-1">
        <Text className={`text-[11px] font-bold uppercase tracking-wide ${session?.live ? 'text-danger' : 'text-muted'}`}>
          {session?.live ? '● Đang diễn ra' : 'Buổi học tiếp theo'}
        </Text>
        {session && start ? (
          <>
            <Text className="text-[16px] font-extrabold text-foreground" numberOfLines={1}>
              {session.class_code} · {sessionLabel(session.session_number)}
            </Text>
            <Text className="text-[12.5px] text-muted" numberOfLines={1}>
              {dayLabel(start, now)} · {formatTime(start)}–{formatTime(session.end)}
              {session.teacher_name ? ` · GV ${session.teacher_name}` : ''}
            </Text>
          </>
        ) : (
          <Text className="text-[13px] text-muted">Không có buổi nào trong 7 ngày tới</Text>
        )}
      </View>
      {session ? <Ionicons name="chevron-forward" size={16} color="#9ca3af" /> : null}
    </Pressable>
  );
}

function QuickStat({
  icon3d,
  value,
  label,
  sub,
  subDanger,
  onPress,
}: {
  icon3d: number;
  value?: number;
  label: string;
  sub: string;
  subDanger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} className="flex-1 gap-1.5 rounded-2xl border border-border bg-surface p-3 active:opacity-80">
      <View className="flex-row items-center gap-2">
        <Image source={icon3d} style={{ width: 34, height: 34 }} contentFit="contain" accessible={false} />
        <Text className="flex-1 text-[22px] font-extrabold text-foreground" numberOfLines={1} adjustsFontSizeToFit>
          {value === undefined ? '–' : value.toLocaleString('vi-VN')}
        </Text>
        <Ionicons name="chevron-forward" size={14} color="#9ca3af" />
      </View>
      <View>
        <Text className="text-[12px] font-bold text-foreground" numberOfLines={1}>
          {label}
        </Text>
        <Text className={`text-[11.5px] ${subDanger ? 'font-semibold text-danger' : 'text-muted'}`} numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

function AttentionSection({ students, total }: { students: AssistantAttentionStudent[]; total: number }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState(false);
  const { data: token } = useMediaToken();
  const filtered = useMemo(
    () => (filter === 'all' ? students : students.filter((s) => s.reasons.some((r) => r.code === filter))),
    [students, filter],
  );
  const shown = expanded ? filtered : filtered.slice(0, 5);
  const counts: Record<Filter, number> = {
    all: students.length,
    overdue: students.filter((s) => s.overdue_count > 0).length,
    absent: students.filter((s) => s.absent_recent > 0).length,
  };
  const FILTERS: { value: Filter; label: string }[] = [
    { value: 'all', label: 'Tất cả' },
    { value: 'overdue', label: 'Thiếu bài' },
    { value: 'absent', label: 'Vắng học' },
  ];

  return (
    <View className="gap-2.5">
      <SectionTitle
        icon="alert-circle"
        title="Học viên cần chú ý"
        right={total ? <Badge label={String(total)} tone="warning" /> : null}
      />
      <View className="flex-row gap-2">
        {FILTERS.map((f) => (
          <Pressable
            key={f.value}
            onPress={() => {
              setFilter(f.value);
              setExpanded(false);
            }}
            className={`h-8 flex-row items-center gap-1 rounded-full px-3 ${filter === f.value ? 'bg-foreground' : 'bg-surface-muted'}`}>
            <Text className={`text-[12.5px] font-semibold ${filter === f.value ? 'text-background' : 'text-foreground'}`}>{f.label}</Text>
            <Text className={`text-[12px] ${filter === f.value ? 'text-background' : 'text-muted'}`} style={filter === f.value ? { opacity: 0.7 } : undefined}>
              {counts[f.value]}
            </Text>
          </Pressable>
        ))}
      </View>

      {shown.length ? (
        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          {shown.map((s, i) => (
            <AttentionRow key={`${s.group_id}-${s.student_id}`} student={s} first={i === 0} avatar={resolveMediaUrl(s.avatar, token?.media_token)} />
          ))}
          {filtered.length > 5 ? (
            <Pressable onPress={() => setExpanded((v) => !v)} className="items-center border-t border-border py-3 active:opacity-70">
              <Text className="text-[13px] font-semibold text-brand">{expanded ? 'Thu gọn' : `Xem thêm ${filtered.length - 5} học viên`}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View className="items-center gap-1.5 rounded-2xl border border-border bg-surface px-4 py-7">
          <Ionicons name="checkmark-circle" size={30} color="#10b981" />
          <Text className="text-[14px] font-semibold text-foreground">Mọi học viên đều ổn</Text>
          <Text className="text-center text-[12.5px] text-muted">Không ai thiếu bài quá hạn hay vắng buổi gần đây.</Text>
        </View>
      )}
    </View>
  );
}

function AttentionRow({ student: s, first, avatar }: { student: AssistantAttentionStudent; first: boolean; avatar?: string }) {
  const success = useThemeColor('success');
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/teach/groups/[id]', params: { id: s.group_id } })}
      className={`flex-row gap-3 px-3.5 py-3 active:bg-surface-muted ${first ? '' : 'border-t border-border'}`}>
      <Avatar name={s.name} uri={avatar} size={40} />
      <View className="min-w-0 flex-1 gap-1.5">
        <View>
          <Text className="text-[14.5px] font-bold text-foreground" numberOfLines={1}>
            {s.name}
          </Text>
          <Text className="text-[12px] text-muted" numberOfLines={1}>
            {s.class_code} · {s.group_name}
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-1">
          {s.reasons.map((r) => (
            <Badge key={r.code} label={r.label} tone={REASON_TONE[r.code]} />
          ))}
        </View>
        {s.overdue_assignments.length ? (
          <Text className="text-[12px] text-muted" numberOfLines={1}>
            Chưa nộp: {s.overdue_assignments.map((a) => a.title).join(' · ')}
          </Text>
        ) : null}
      </View>
      {s.phone ? (
        <Pressable
          hitSlop={6}
          accessibilityLabel={`Gọi ${s.name}`}
          onPress={() => void Linking.openURL(`tel:${s.phone}`)}
          className="h-9 w-9 items-center justify-center self-center rounded-full bg-success-soft active:opacity-70">
          <Ionicons name="call" size={16} color={success} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function UpcomingSection({ sessions, now }: { sessions: AssistantUpcomingSession[]; now: number }) {
  const days = useMemo(() => {
    const map = new Map<string, { label: string; items: AssistantUpcomingSession[] }>();
    sessions.forEach((s) => {
      const d = new Date(s.start);
      const key = d.toDateString();
      if (!map.has(key)) map.set(key, { label: dayLabel(d, now), items: [] });
      map.get(key)!.items.push(s);
    });
    return Array.from(map.values());
  }, [sessions, now]);

  return (
    <View className="gap-2.5">
      <SectionTitle icon="calendar" title="Lịch 7 ngày tới" />
      {days.length ? (
        <View className="gap-3 rounded-2xl border border-border bg-surface p-3.5">
          {days.map((day) => (
            <View key={day.label} className="gap-1.5">
              <Text className="text-[11px] font-bold uppercase tracking-wide text-muted">{day.label}</Text>
              {day.items.map((s) => (
                <View
                  key={`${s.class_id}-${s.start}`}
                  className={`flex-row items-center gap-3 rounded-xl px-3 py-2 ${s.live ? 'bg-danger-soft' : 'bg-surface-muted'}`}>
                  <View className="w-11 items-center">
                    <Text className="text-[14px] font-extrabold text-foreground">{formatTime(s.start)}</Text>
                    <Text className="text-[10.5px] text-muted">{formatTime(s.end)}</Text>
                  </View>
                  <View className="h-8 w-px bg-border" />
                  <View className="min-w-0 flex-1">
                    <Text className="text-[13.5px] font-semibold text-foreground" numberOfLines={1}>
                      {s.class_code} · {sessionLabel(s.session_number)}
                    </Text>
                    {s.teacher_name ? (
                      <Text className="text-[12px] text-muted" numberOfLines={1}>
                        GV {s.teacher_name}
                      </Text>
                    ) : null}
                  </View>
                  {s.live ? <Badge label="Đang học" tone="danger" dot /> : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <Text className="rounded-2xl border border-border bg-surface px-4 py-5 text-center text-[13px] text-muted">
          Không có buổi học nào trong 7 ngày tới.
        </Text>
      )}
    </View>
  );
}

function RecentSection({ sessions }: { sessions: AssistantRecentSession[] }) {
  if (!sessions.length) return null;
  return (
    <View className="gap-2.5">
      <SectionTitle icon="checkmark-done" title="Điểm danh buổi vừa học" />
      <View className="overflow-hidden rounded-2xl border border-border bg-surface">
        {sessions.map((s, i) => {
          const d = new Date(s.date);
          return (
            <Pressable
              key={s._id}
              onPress={() => router.push({ pathname: '/teach/[id]/attendance', params: { id: s.class_id } })}
              className={`gap-1.5 px-3.5 py-3 active:bg-surface-muted ${i ? 'border-t border-border' : ''}`}>
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 text-[14px] font-semibold text-foreground" numberOfLines={1}>
                  {s.class_code} · {sessionLabel(s.session_number)}
                </Text>
                <Text className="text-[12px] text-muted">
                  {WEEKDAY_FULL[d.getDay()]} {dayOf(d)}
                </Text>
              </View>
              {s.absent.length ? (
                <View className="flex-row flex-wrap gap-1">
                  {s.absent.map((a) => (
                    <Badge key={a._id} label={`Vắng: ${a.name}`} tone="danger" />
                  ))}
                </View>
              ) : (
                <View className="flex-row items-center gap-1">
                  <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                  <Text className="text-[12.5px] font-medium text-success">Nhóm bạn đủ mặt</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Meter({ icon3d, label, display }: { icon3d: number; label: string; display: string }) {
  return (
    <View className="flex-1 items-center gap-0.5 rounded-xl bg-surface-muted py-2">
      <Image source={icon3d} style={{ width: 26, height: 26 }} contentFit="contain" accessible={false} />
      <Text className="text-[16px] font-extrabold text-foreground">{display}</Text>
      <Text className="text-[10.5px] text-muted">{label}</Text>
    </View>
  );
}

function GroupCard({ group: g }: { group: AssistantDashboardGroup }) {
  const next = g.next_session ? new Date(g.next_session.start) : null;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/teach/groups/[id]', params: { id: g.group_id } })}
      className="gap-3 rounded-2xl border border-border bg-surface p-3.5 active:opacity-90">
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-1.5">
            <Badge label={g.class_code} tone="info" />
            {g.attention_count ? <Badge label={`${g.attention_count} cần chú ý`} tone="warning" /> : <Badge label="Ổn định" tone="success" />}
          </View>
          <Text className="text-[15px] font-bold text-foreground" numberOfLines={1}>
            {g.group_name}
          </Text>
          <Text className="text-[12px] text-muted" numberOfLines={1}>
            {g.teacher_name ? `GV ${g.teacher_name}` : g.class_name}
            {g.class_time ? ` · ${g.class_time}` : ''}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-[18px] font-extrabold text-foreground">
            {g.student_count}
            {g.max_students ? <Text className="text-[12px] font-medium text-muted">/{g.max_students}</Text> : null}
          </Text>
          <Text className="text-[10.5px] text-muted">học viên</Text>
        </View>
      </View>

      <View className="flex-row gap-2">
        <Meter icon3d={ASSISTANT_DASHBOARD_3D_ICONS.completion} label="Nộp bài" display={`${g.completion_rate}%`} />
        <Meter
          icon3d={ASSISTANT_DASHBOARD_3D_ICONS.attendance}
          label="Chuyên cần"
          display={g.attendance_rate === null ? '–' : `${g.attendance_rate}%`}
        />
        <Meter
          icon3d={ASSISTANT_DASHBOARD_3D_ICONS.score}
          label="Điểm TB"
          display={g.average_score === null ? '–' : String(g.average_score)}
        />
      </View>

      <View className="flex-row items-center gap-1.5 border-t border-border pt-2.5">
        <Ionicons name="time-outline" size={14} color="#9ca3af" />
        <Text className="flex-1 text-[12.5px] text-muted" numberOfLines={1}>
          {next
            ? `Buổi tới: ${WEEKDAY_FULL[next.getDay()]} ${dayOf(next)} · ${formatTime(next)}`
            : g.overdue_count
              ? `${g.overdue_count} bài quá hạn chưa nộp`
              : 'Chưa có lịch sắp tới'}
        </Text>
        <Ionicons name="chevron-forward" size={15} color="#9ca3af" />
      </View>
    </Pressable>
  );
}
