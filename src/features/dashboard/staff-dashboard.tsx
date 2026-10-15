import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { StateView } from '@/components/ui/state-view';
import { STAFF_DASHBOARD_3D_ICONS } from '@/constants/three-d-icons';
import { api, getErrorMessage } from '@/lib/api/client';
import { WEEKDAY_SHORT } from '@/lib/format';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

import { AreaChart } from './area-chart';
import { DashboardHeader } from './dashboard-header';

type IconName = ComponentProps<typeof Ionicons>['name'];
export type DashboardPeriod = 'day' | 'week' | 'month' | 'year';

/** Copy từ uspeak-class-fe/src/stores/assignment/types.ts (SystemDashboardStats). */
interface SystemDashboardStats {
  totalSubmissions: number;
  totalCompleted: number;
  totalPending: number;
  totalClaimed: number;
  totalWaitingReview: number;
  totalRegradeRequested: number;
  completedToday: number;
  completedThisWeek: number;
  completedThisMonth: number;
  submittedToday: number;
  totalAssignments: number;
  avgGradingTimeSeconds: number;
  completionRate: number;
  period?: DashboardPeriod;
  dailyStats: { date: string; submitted: number; completed: number; created: number }[];
}

export function useSystemDashboardStats(period: DashboardPeriod, enabled = true) {
  return useQuery({
    queryKey: ['assignments', 'stats', 'system', period],
    enabled,
    queryFn: async () =>
      (await api.get<{ data: SystemDashboardStats }>('/assignments/stats/system-dashboard', { params: { period } })).data.data,
    staleTime: 60_000,
    // Đổi kỳ (ngày/tuần/…) vẫn giữ số cũ trong lúc tải — không thì cả trang trắng rồi nhảy lên đầu.
    placeholderData: keepPreviousData,
  });
}

const PERIODS: { value: DashboardPeriod; label: string; title: string }[] = [
  { value: 'day', label: 'Ngày', title: 'Hoạt động 24 giờ qua' },
  { value: 'week', label: 'Tuần', title: 'Hoạt động 7 ngày gần nhất' },
  { value: 'month', label: 'Tháng', title: 'Hoạt động 30 ngày gần nhất' },
  { value: 'year', label: 'Năm', title: 'Hoạt động 12 tháng gần nhất' },
];

// Cùng màu với biểu đồ web — đủ tương phản trên cả nền sáng lẫn tối
const SERIES_COLORS = { submitted: '#3b82f6', completed: '#10b981', created: '#8b5cf6' };

const pad = (n: number) => String(n).padStart(2, '0');

function chartLabel(iso: string, period: DashboardPeriod) {
  const d = new Date(iso);
  if (period === 'day') return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (period === 'year') return `T${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
  return `${WEEKDAY_SHORT[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

function formatDuration(seconds: number) {
  if (!seconds) return '0s';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m === 0 ? `${s}s` : `${m}m ${s}s`;
}

function greeting(hour: number) {
  if (hour < 12) return 'Chào buổi sáng';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

/**
 * Dashboard quản trị / giáo viên / trợ giảng — bản mobile của uspeak-class-fe AdminDashboard.tsx:
 * thống kê bài nộp + hàng đợi nhận xét toàn hệ thống và biểu đồ hoạt động theo kỳ.
 */
export function StaffDashboard({
  period,
  onPeriodChange,
  shortcuts,
}: {
  period: DashboardPeriod;
  onPeriodChange: (p: DashboardPeriod) => void;
  shortcuts: ReactNode;
}) {
  const user = useAuthStore((s) => s.user);
  const muted = useThemeColor('muted');
  const [hour] = useState(() => new Date().getHours());
  const stats = useSystemDashboardStats(period);
  const s = stats.data;

  return (
    <View className="gap-4">
      {/* ── Lời chào + 3 số nhanh ── */}
      <DashboardHeader
        user={user}
        greeting={greeting(hour)}
        eyebrow="Tổng quan hệ thống"
        description="Theo dõi hoạt động toàn hệ thống Uspeak"
        icon="analytics">
        <View className="flex-row gap-2">
          <HeroPill value={s ? String(s.submittedToday) : '–'} label="Nộp hôm nay" color="#ffffff" />
          <HeroPill value={s ? String(s.completedToday) : '–'} label="Nhận xét hôm nay" color="#34d399" />
          <HeroPill value={s ? `${s.completionRate}%` : '–'} label="Tỷ lệ hoàn thành" color="#fbbf24" />
        </View>
      </DashboardHeader>

      {shortcuts}

      {stats.isLoading ? (
        <ActivityIndicator className="py-10" />
      ) : stats.isError || !s ? (
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được thống kê"
          description={getErrorMessage(stats.error)}
          actionLabel="Thử lại"
          onAction={() => void stats.refetch()}
        />
      ) : (
        <>
          <SectionTitle icon="pulse" title="Tổng quan bài nộp" />
          <Grid>
            <Stat icon3d={STAFF_DASHBOARD_3D_ICONS.totalSubmissions} tone="info" label="Tổng bài nộp" sub="trên hệ thống" value={s.totalSubmissions} />
            <Stat icon3d={STAFF_DASHBOARD_3D_ICONS.completedReviews} tone="success" label="Đã nhận xét" sub="bài hoàn thành" value={s.totalCompleted} />
            <Stat icon3d={STAFF_DASHBOARD_3D_ICONS.publishedAssignments} tone="violet" label="Bài tập" sub="đã xuất bản" value={s.totalAssignments} />
            <Stat icon3d={STAFF_DASHBOARD_3D_ICONS.averageGradingTime} tone="warning" label="TB thời gian" sub="mỗi bài nhận xét" value={formatDuration(s.avgGradingTimeSeconds)} />
          </Grid>

          <SectionTitle icon="bar-chart" title="Trạng thái hàng đợi" />
          <Grid>
            <Stat icon3d={STAFF_DASHBOARD_3D_ICONS.pendingGrading} tone="warning" label="Chờ nhận xét" sub="trong hàng đợi" value={s.totalPending} />
            <Stat icon3d={STAFF_DASHBOARD_3D_ICONS.activeGrading} tone="info" label="Đang nhận xét" sub="bài đang được giữ" value={s.totalClaimed} />
            <Stat icon3d={STAFF_DASHBOARD_3D_ICONS.waitingReview} tone="violet" label="Chờ review" sub="bài chờ duyệt" value={s.totalWaitingReview} />
            <Stat icon3d={STAFF_DASHBOARD_3D_ICONS.regradeRequest} tone="danger" label="Nhận xét lại" sub="yêu cầu regrade" value={s.totalRegradeRequested} />
          </Grid>

          <View className="flex-row gap-2">
            <PeriodStat label="Hôm nay" value={s.completedToday} tone="success" />
            <PeriodStat label="Tuần này" value={s.completedThisWeek} tone="info" />
            <PeriodStat label="Tháng này" value={s.completedThisMonth} tone="violet" />
          </View>

          <View className="rounded-2xl border border-border bg-surface p-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-base font-bold text-foreground">{PERIODS.find((p) => p.value === period)?.title}</Text>
              {stats.isPlaceholderData ? <ActivityIndicator size="small" /> : null}
            </View>
            <View className="mb-4 flex-row rounded-xl bg-surface-muted p-1">
              {PERIODS.map((p) => (
                <Pressable
                  key={p.value}
                  onPress={() => onPeriodChange(p.value)}
                  className={`flex-1 items-center rounded-lg py-1.5 ${period === p.value ? 'bg-surface' : ''}`}>
                  <Text className={`text-sm font-medium ${period === p.value ? 'text-foreground' : 'text-muted'}`}>{p.label}</Text>
                </Pressable>
              ))}
            </View>
            {s.dailyStats.every((d) => !d.submitted && !d.completed && !d.created) ? (
              <View className="items-center py-10">
                <Ionicons name="bar-chart-outline" size={36} color={muted} />
                <Text className="mt-2 text-sm font-medium text-foreground">Chưa có dữ liệu</Text>
                <Text className="mt-1 text-xs text-muted">Dữ liệu sẽ xuất hiện khi có hoạt động trên hệ thống.</Text>
              </View>
            ) : (
              <AreaChart
                // Định dạng theo kỳ CỦA DỮ LIỆU (lúc đang tải kỳ mới vẫn hiện dữ liệu kỳ cũ)
                labels={s.dailyStats.map((d) => chartLabel(d.date, s.period ?? period))}
                series={[
                  { key: 'submitted', label: 'Bài nộp', color: SERIES_COLORS.submitted, values: s.dailyStats.map((d) => d.submitted) },
                  { key: 'completed', label: 'Đã nhận xét', color: SERIES_COLORS.completed, values: s.dailyStats.map((d) => d.completed) },
                  { key: 'created', label: 'Bài tập tạo', color: SERIES_COLORS.created, values: s.dailyStats.map((d) => d.created) },
                ]}
              />
            )}
          </View>
        </>
      )}
    </View>
  );
}

// ─── Khối con ────────────────────────────────────────────────────────────────

type Tone = 'info' | 'success' | 'violet' | 'warning' | 'danger';
// Viết đủ tên class để Tailwind quét được
const TONE_BG: Record<Tone, string> = {
  info: 'bg-info-soft',
  success: 'bg-success-soft',
  violet: 'bg-violet-soft',
  warning: 'bg-warning-soft',
  danger: 'bg-danger-soft',
};
const TONE_TEXT: Record<Tone, string> = {
  info: 'text-info',
  success: 'text-success',
  violet: 'text-violet',
  warning: 'text-warning',
  danger: 'text-danger',
};

function HeroPill({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <View className="flex-1 items-center rounded-xl border border-white/25 bg-black/30 px-1.5 py-2.5">
      <Text
        className="text-xl font-extrabold"
        style={{ color, textShadowColor: 'rgba(0, 0, 0, 0.7)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>
        {value}
      </Text>
      <Text
        className="text-center text-[9px] font-bold uppercase leading-3 tracking-wide text-white"
        style={{ textShadowColor: 'rgba(0, 0, 0, 0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 }}>
        {label}
      </Text>
    </View>
  );
}

function SectionTitle({ icon, title }: { icon: IconName; title: string }) {
  const brand = useThemeColor('brand');
  return (
    <View className="-mb-1 flex-row items-center gap-2">
      <Ionicons name={icon} size={16} color={brand} />
      <Text className="text-sm font-bold text-foreground">{title}</Text>
    </View>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap justify-between gap-y-2.5">{children}</View>;
}

function Stat({
  icon,
  icon3d,
  tone,
  label,
  sub,
  value,
}: {
  icon?: IconName;
  icon3d?: number;
  tone: Tone;
  label: string;
  sub: string;
  value: number | string;
}) {
  const color = useThemeColor(tone);
  return (
    <View className="w-[48.8%] gap-2 rounded-2xl border border-border bg-surface p-3">
      <View className="flex-row items-center justify-between">
        {icon3d ? (
          <Image source={icon3d} style={{ width: 38, height: 38 }} contentFit="contain" accessible={false} />
        ) : (
          <View className={`h-7 w-7 items-center justify-center rounded-lg ${TONE_BG[tone]}`}>
            <Ionicons name={icon ?? 'ellipse'} size={15} color={color} />
          </View>
        )}
        <Text className={`text-2xl font-extrabold ${TONE_TEXT[tone]}`}>
          {typeof value === 'number' ? value.toLocaleString('vi-VN') : value}
        </Text>
      </View>
      <View>
        <Text className="text-[11px] font-bold uppercase tracking-wide text-muted" numberOfLines={1}>
          {label}
        </Text>
        <Text className="text-[11px] text-muted" numberOfLines={1}>
          {sub}
        </Text>
      </View>
    </View>
  );
}

function PeriodStat({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <View className="flex-1 rounded-2xl border border-border bg-surface p-3">
      <Text className="text-[10px] font-bold uppercase tracking-wide text-muted">{label}</Text>
      <Text className={`mt-1 text-2xl font-extrabold ${TONE_TEXT[tone]}`}>{value.toLocaleString('vi-VN')}</Text>
      <Text className="text-[10px] text-muted">bài hoàn thành</Text>
    </View>
  );
}
