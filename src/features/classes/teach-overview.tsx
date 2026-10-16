import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ProgressRing } from '@/components/ui/progress-ring';
import { CLASS_CONTENT_3D_ICONS, STUDENT_DASHBOARD_3D_ICONS } from '@/constants/three-d-icons';
import { WEEKDAY_SHORT } from '@/lib/format';
import { useThemeColor, type ThemeColor } from '@/theme/use-theme-color';

import { countdownLabel, nextSession, scheduleParts, sessionDayLabel } from './next-session';

/**
 * Khối dùng chung của trang tổng quan LỚP DẠY (`teach/[id]`) và NHÓM GIẢNG DẠY (`teach/groups/[id]`) —
 * 2 trang cùng bố cục (anh yêu cầu 16/10/2026): buổi dạy tiếp theo, 3 vòng chỉ số, mục quản lý.
 */

/** Một mục quản lý lớp: icon màu + tên + dòng số liệu + số việc cần chú ý. */
export function MenuRow({
  icon3d,
  title,
  subtitle,
  badge,
  onPress,
}: {
  icon3d: number;
  title: string;
  subtitle: string;
  badge?: number;
  onPress: () => void;
}) {
  const muted = useThemeColor('muted');
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-3 active:bg-surface-muted">
      <View className="h-11 w-11 items-center justify-center overflow-hidden rounded-2xl">
        <Image source={icon3d} style={{ width: 44, height: 44 }} contentFit="contain" accessible={false} />
      </View>
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-foreground">{title}</Text>
        <Text className="text-[12.5px] text-muted" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {badge ? (
        <View className="min-w-[22px] items-center rounded-full bg-warning px-1.5 py-0.5">
          <Text className="text-[11px] font-bold text-white">{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={17} color={muted} />
    </Pressable>
  );
}

/** Buổi dạy tiếp theo (suy từ class_time) + đếm ngược; tự cập nhật mỗi 30 giây. */
export function NextTeachCard({ classTime, label = 'Buổi dạy tiếp theo' }: { classTime?: string | null; label?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const session = nextSession(classTime, now);
  const parts = scheduleParts(classTime);
  if (!session) {
    return classTime ? (
      <View className="gap-0.5 rounded-3xl bg-surface p-4">
        <Text className="text-[12px] font-semibold text-muted">Lịch dạy</Text>
        <Text className="text-[15px] font-bold text-foreground">{classTime}</Text>
      </View>
    ) : null;
  }
  const hot = session.live || session.soon;
  const countdown = countdownLabel(session, now);
  return (
    <View className={`flex-row items-center gap-3.5 rounded-3xl border bg-surface p-4 ${hot ? 'border-success' : 'border-border'}`}>
      <View className={`h-14 w-14 items-center justify-center rounded-2xl ${hot ? 'bg-success-soft' : 'bg-brand-soft'}`}>
        <Text className={`text-[11px] font-bold ${hot ? 'text-success' : 'text-brand'}`}>{WEEKDAY_SHORT[session.start.getDay()]}</Text>
        <Text className={`text-[21px] font-extrabold leading-6 ${hot ? 'text-success' : 'text-brand'}`}>{session.start.getDate()}</Text>
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-[12px] font-semibold text-muted">{label}</Text>
        <Text className="text-[16px] font-bold text-foreground" numberOfLines={1}>
          {sessionDayLabel(session.start, now)} · {parts?.time}
        </Text>
        {countdown ? (
          <View className="flex-row items-center gap-1.5">
            {hot ? <View className="h-2 w-2 rounded-full bg-success" /> : null}
            <Text className={`text-[12.5px] font-semibold ${hot ? 'text-success' : 'text-muted'}`}>{countdown}</Text>
          </View>
        ) : null}
        {parts ? <Text className="text-[11.5px] text-muted">Lịch cố định: {parts.days.join(' · ')}</Text> : null}
      </View>
    </View>
  );
}

const fmtScore = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(1).replace(/\.0$/, '');

/** 3 vòng chỉ số lớp/nhóm + dòng "N học viên cần chú ý" (bấm → màn Học viên, sắp xếp Cần chú ý). */
export function StatsCard({
  title = 'Tình hình lớp',
  stats,
  activeStudents,
  maxStudents,
  attention,
  onOpenStudents,
}: {
  title?: string;
  stats: {
    total_students: number;
    total_assignments: number;
    total_submissions: number;
    total_completed: number;
    completion_rate: number;
    average_score: number | null;
  };
  activeStudents?: number;
  maxStudents?: number | null;
  attention: number;
  onOpenStudents: () => void;
}) {
  const brand = useThemeColor('brand');
  // completion_rate của class-be = bài đã nộp / (học viên × bài tập) — tức tỷ lệ NỘP
  const submitRate = Math.round(Math.min(100, Math.max(0, stats.completion_rate)));
  // total_completed đếm cả lần nộp lại đã chấm nên có thể vượt total_submissions (vd 395/392) → chặn 100%
  const reviewedRate = stats.total_submissions ? Math.min(100, Math.round((stats.total_completed / stats.total_submissions) * 100)) : 0;
  const avg = stats.average_score;
  const students = activeStudents ?? stats.total_students;
  return (
    <View className="rounded-3xl border border-border bg-surface">
      <View className="flex-row items-center justify-between px-4 pt-3.5">
        <View className="flex-row items-center gap-1.5">
          <Image
            source={CLASS_CONTENT_3D_ICONS.report}
            style={{ width: 28, height: 28 }}
            contentFit="contain"
            accessible={false}
          />
          <Text className="text-[15px] font-bold text-foreground">{title}</Text>
        </View>
        <Text className="text-[12.5px] text-muted">
          {students}
          {maxStudents ? `/${maxStudents}` : ''} học viên · {stats.total_assignments} bài tập
        </Text>
      </View>
      <View className="flex-row px-2 pb-4 pt-3">
        <Ring
          percent={submitRate}
          color="info"
          value={`${submitRate}%`}
          label="Tỷ lệ nộp"
          sub={`${stats.total_submissions.toLocaleString('vi-VN')} bài nộp`}
        />
        <Ring
          percent={reviewedRate}
          color="success"
          value={`${reviewedRate}%`}
          label="Đã nhận xét"
          sub={`${stats.total_completed.toLocaleString('vi-VN')} bài`}
        />
        <Ring
          percent={avg ? avg * 10 : 0}
          color={avg !== null && avg < 5 ? 'warning' : 'brand'}
          value={fmtScore(avg)}
          label="Điểm TB"
          sub="thang 10"
        />
      </View>
      {attention > 0 ? (
        <Pressable
          onPress={onOpenStudents}
          className="flex-row items-center gap-2.5 border-t border-border px-4 py-3 active:bg-surface-muted">
          <Image
            source={STUDENT_DASHBOARD_3D_ICONS.warning}
            style={{ width: 24, height: 24 }}
            contentFit="contain"
            accessible={false}
          />
          <Text className="flex-1 text-[13.5px] text-foreground">
            <Text className="font-bold text-warning">{attention} học viên</Text> cần chú ý (nộp ít / nợ bài)
          </Text>
          <Ionicons name="chevron-forward" size={14} color={brand} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Ring({ percent, color, value, label, sub }: { percent: number; color: ThemeColor; value: string; label: string; sub?: string }) {
  return (
    <View className="flex-1 items-center gap-1.5">
      <ProgressRing percent={percent} size={62} stroke={6} color={color}>
        <Text className="text-[14px] font-extrabold text-foreground">{value}</Text>
      </ProgressRing>
      <View className="items-center">
        <Text className="text-[12.5px] font-semibold text-foreground">{label}</Text>
        {sub ? <Text className="text-[11px] text-muted">{sub}</Text> : null}
      </View>
    </View>
  );
}
