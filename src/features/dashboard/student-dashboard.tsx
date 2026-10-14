import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { mediaCacheKey, useMediaUrl } from '@/lib/media';
import { StateView } from '@/components/ui/state-view';
import { useAllMyAssignments, type StudentAssignmentItem } from '@/features/assignments/api';
import { openAssignment } from '@/features/assignments/detail-api';
import { useMyClasses, type StudentClassItem } from '@/features/classes/api';
import { useJoinRoom } from '@/features/classes/use-join-room';
import { useStudentSchedule } from '@/features/schedule/api';
import { getErrorMessage } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth.store';
import { useThemeColor } from '@/theme/use-theme-color';

import {
  assignmentScore10,
  average,
  classDisplayName,
  classRisk,
  formatDeadline,
  formatMoney,
  formatScore,
  gradeLabel,
  isDirectTuitionClass,
  isLearningClass,
  isZoomClass,
  learningMetrics,
  nextClass,
} from './student-metrics';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Truy vấn dùng chung cho dashboard học viên — màn Trang chủ gọi refetch khi kéo xuống. */
export function useStudentDashboardData() {
  const classes = useMyClasses();
  const assignments = useAllMyAssignments();
  const schedule = useStudentSchedule();
  return {
    classes,
    assignments,
    schedule,
    refetch: () => Promise.all([classes.refetch(), assignments.refetch(), schedule.refetch()]),
  };
}

/**
 * Dashboard học viên — bản mobile của uspeak-class-fe StudentDashboard.tsx (cùng công thức số liệu,
 * xem student-metrics.ts). Thứ tự khối xếp lại cho điện thoại: việc cần làm ngay (buổi học tới,
 * cảnh báo, bài cần làm) lên trước, bảng so sánh lớp + tài chính xuống sau.
 */
export function StudentDashboard({ data, shortcuts }: { data: ReturnType<typeof useStudentDashboardData>; shortcuts: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  // Ảnh đại diện lưu ở class-be dạng `/uploads/file?key=…` → phải nối media token mới tải được
  const avatarUri = useMediaUrl(user?.avatar);
  const brand = useThemeColor('brand');
  const [now] = useState(() => Date.now());
  const classesList = data.classes.data;
  const assignmentsList = data.assignments.data;

  const view = useMemo(() => {
    const classes = classesList ?? [];
    const assignments = assignmentsList ?? [];
    const learning = classes.filter(isLearningClass);
    const learningIds = new Set(learning.map((c) => c._id));
    const learningAssignments = assignments.filter((a) => learningIds.has(a.class_id));
    const direct = classes.filter(isDirectTuitionClass);
    const totalDebt = direct.reduce((s, c) => s + Number(c.remaining_debt || 0), 0);
    const due = learningAssignments.filter((a) => a.student_status === 'not_submitted' || a.student_status === 'overdue');
    const risks = learning
      .map((c) => classRisk(c, learningAssignments))
      .filter((r) => r.score > 0)
      .sort((a, b) => ({ high: 0, medium: 1, low: 2 })[a.level] - { high: 0, medium: 1, low: 2 }[b.level] || b.score - a.score);
    const compare = classes.filter((c) => String(c.course_type || '').toLowerCase() !== 'combo');
    return {
      classes,
      assignments,
      learningCount: learning.length,
      completedCount: classes.length - learning.length,
      metrics: learningMetrics(learning, learningAssignments),
      averageScore: average(learningAssignments.map(assignmentScore10)),
      due,
      overdue: due.filter((a) => a.student_status === 'overdue'),
      topRisk: risks[0] ?? null,
      totalDebt,
      debtClasses: direct.filter((c) => Number(c.remaining_debt || 0) > 0),
      groups: [
        { key: 'online', title: 'Lớp học online', classes: compare.filter(isZoomClass) },
        {
          key: 'elearning',
          title: 'Lớp học E-Learning',
          classes: compare.filter((c) => String(c.course_type || '').toLowerCase() === 'elearning'),
        },
      ].filter((g) => g.classes.length > 0),
    };
  }, [classesList, assignmentsList]);

  if (data.classes.isLoading || data.assignments.isLoading) {
    return <ActivityIndicator className="py-16" />;
  }
  if (data.classes.isError || data.assignments.isError) {
    return (
      <StateView
        icon="cloud-offline-outline"
        title="Không tải được dashboard"
        description={getErrorMessage(data.classes.error ?? data.assignments.error)}
        actionLabel="Thử lại"
        onAction={() => void data.refetch()}
      />
    );
  }

  const m = view.metrics;
  const upcoming = nextClass(data.schedule.data?.upcomingClasses, view.classes);

  return (
    <View className="gap-4">
      {/* ── Hồ sơ ── */}
      <View className="flex-row items-center gap-3">
        <View className="rounded-full border-4 border-brand-soft">
          <Avatar name={user?.name} uri={avatarUri} cacheKey={mediaCacheKey(user?.avatar)} size={52} />
        </View>
        <View className="flex-1 gap-1.5">
          <Text className="text-xl font-extrabold text-foreground" numberOfLines={1}>
            {user?.name || 'Học viên'}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            <Pill icon="book" label={`${view.learningCount} lớp đang học`} solid />
            <Pill icon="checkmark-circle" label={`${view.completedCount} lớp hoàn thành`} />
          </View>
        </View>
      </View>

      <NextClassCard upcoming={upcoming} />

      {/* ── KPI 2×2 ── */}
      <View className="flex-row flex-wrap justify-between gap-y-3">
        <Kpi label="Tổng số lớp" value={String(view.classes.length).padStart(2, '0')} subtitle="Hành trình học tập" accent />
        <Kpi
          label="Chuyên cần TB"
          value={m.attendanceRate !== null ? `${m.attendanceRate}%` : '—'}
          subtitle={m.totalSessions > 0 ? `${m.attendedSessions}/${m.totalSessions} buổi hiện tại` : 'Chưa có dữ liệu điểm danh'}
          progress={m.attendanceRate ?? 0}
        />
        <Kpi label="Điểm trung bình" value={formatScore(view.averageScore)} subtitle={`Xếp loại: ${gradeLabel(view.averageScore)}`} />
        <Kpi
          label="Chỉ số học tập"
          value={`${m.learningIndex}%`}
          subtitle={`BT ${m.assignmentCompleted}/${m.assignmentTotal} • ${m.totalSessions > 0 ? `Đi học ${m.attendedSessions}/${m.totalSessions}` : 'Chưa có điểm danh'}`}
          progress={m.learningIndex}
          accent
        />
      </View>

      {shortcuts}

      {/* ── Cảnh báo ── */}
      <Card title="Cảnh báo & Lưu ý" icon="warning" iconTone="danger">
        <View className="gap-2.5">
          {view.topRisk ? (
            <AlertRow
              danger
              title={view.topRisk.level === 'high' ? 'Lớp nguy cơ cao' : 'Lớp cần chú ý'}
              text={`Lớp ${view.topRisk.className} có ${view.topRisk.reasons.join(', ')}.`}
              onPress={() => router.push({ pathname: '/class/[id]', params: { id: view.topRisk!.classId } })}
            />
          ) : (
            <AlertRow icon="shield-checkmark-outline" title="Lớp nguy cơ cao" text="Chưa có lớp nào có dấu hiệu rủi ro." />
          )}
          <AlertRow
            danger={view.overdue.length > 0}
            icon="clipboard-outline"
            title="Bài tập quá hạn"
            text={view.overdue.length > 0 ? `Bạn có ${view.overdue.length} bài tập đang quá hạn.` : 'Không có bài tập quá hạn.'}
            onPress={view.overdue.length > 0 ? () => router.navigate('/assignments') : undefined}
          />
        </View>
      </Card>

      {/* ── Bài tập cần làm ── */}
      <Card
        title="Bài tập cần làm"
        right={
          <View className="rounded-full bg-brand px-2.5 py-1">
            <Text className="text-[11px] font-bold text-on-brand">{view.due.length} bài</Text>
          </View>
        }>
        {view.due.length === 0 ? (
          <Text className="rounded-xl bg-surface-muted p-4 text-center text-sm text-muted">Bạn không có bài tập cần nộp. 🎉</Text>
        ) : (
          <View className="gap-2.5">
            {view.due.slice(0, 4).map((a) => (
              <DueRow key={a._id} item={a} now={now} />
            ))}
            {view.due.length > 4 ? (
              <Pressable onPress={() => router.navigate('/assignments')} className="items-center py-1.5 active:opacity-70">
                <Text className="text-sm font-semibold text-brand">Xem tất cả {view.due.length} bài</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </Card>

      {/* ── So sánh các lớp ── */}
      <Card title="So sánh các lớp học" subtitle="Thống kê học tập hiện tại">
        {view.groups.length === 0 ? (
          <Text className="rounded-xl bg-surface-muted p-4 text-center text-sm text-muted">Chưa có lớp học nào.</Text>
        ) : (
          <View className="gap-3">
            {view.groups.map((g) => (
              <View key={g.key} className="gap-2">
                <Text className="rounded-lg bg-brand px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-on-brand">
                  {g.title}
                </Text>
                {g.classes.map((c) => (
                  <CompareRow key={c._id} cls={c} assignments={view.assignments} />
                ))}
              </View>
            ))}
          </View>
        )}
      </Card>

      {/* ── Tài chính ── */}
      {view.totalDebt > 0 ? (
        <Card title="Tài chính tổng hợp">
          <View className="mb-4 flex-row flex-wrap items-end gap-2">
            <Text className="text-3xl font-extrabold text-brand">{formatMoney(view.totalDebt)}</Text>
            <Text className="pb-1 text-sm text-muted">Tổng nợ còn lại</Text>
          </View>
          <View className="gap-3">
            {view.debtClasses.map((c) => {
              const debt = Number(c.remaining_debt || 0);
              return (
                <View key={c._id} className="gap-1">
                  <View className="flex-row justify-between gap-3">
                    <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                      {classDisplayName(c)}
                    </Text>
                    <Text className="text-sm font-bold text-foreground">{formatMoney(debt)}</Text>
                  </View>
                  <Bar value={(debt / view.totalDebt) * 100} track="bg-brand-soft" />
                </View>
              );
            })}
          </View>
          <Pressable
            onPress={() => router.push({ pathname: '/class/[id]', params: { id: view.debtClasses[0]._id } })}
            className="mt-4 h-11 flex-row items-center justify-center gap-2 rounded-xl border-2 border-brand active:opacity-70">
            <Ionicons name="wallet-outline" size={17} color={brand} />
            <Text className="text-base font-bold text-brand">Thanh toán ngay</Text>
          </Pressable>
        </Card>
      ) : null}
    </View>
  );
}

// ─── Khối con ────────────────────────────────────────────────────────────────

function NextClassCard({ upcoming }: { upcoming: ReturnType<typeof nextClass> }) {
  const brand = useThemeColor('brand');
  const { join, joiningCode } = useJoinRoom();
  const cls = upcoming?.cls ?? null;
  const item = upcoming?.item ?? null;
  const joining = !!cls?.class_code && joiningCode === cls.class_code;

  const enter = () => {
    if (cls?.class_code) {
      if (cls.access_locked) {
        Alert.alert('Lớp đang bị khoá', cls.access_lock_reason || 'Vui lòng liên hệ Uspeak để được hỗ trợ.');
        return;
      }
      void join(cls.class_code, item?.zoom_link);
    } else if (item?.zoom_link) {
      void Linking.openURL(item.zoom_link);
    }
  };

  return (
    <View className="overflow-hidden rounded-2xl bg-brand p-5">
      <View className="absolute -bottom-8 -right-6 opacity-10">
        <Ionicons name="calendar" size={130} color="#ffffff" />
      </View>
      <Text className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/75">Lịch học tiếp theo</Text>
      <Text className="text-lg font-extrabold text-white" numberOfLines={2}>
        {cls ? classDisplayName(cls) : item?.class_name || 'Chưa có lịch học'}
      </Text>
      <View className="mt-1.5 flex-row items-center gap-1.5">
        <Ionicons name="time-outline" size={16} color="#ffffff" />
        <Text className="text-sm font-bold text-white">{item?.class_time || 'Đang cập nhật'}</Text>
      </View>
      <Pressable
        disabled={!item || joining}
        onPress={enter}
        className={`mt-4 h-11 flex-row items-center justify-center gap-2 rounded-xl bg-white active:opacity-80 ${!item ? 'opacity-60' : ''}`}>
        {joining ? <ActivityIndicator color={brand} /> : <Ionicons name="videocam" size={18} color={brand} />}
        <Text className="text-base font-bold" style={{ color: brand }}>
          {joining ? 'Đang mở…' : 'Vào lớp online'}
        </Text>
      </Pressable>
    </View>
  );
}

function Pill({ icon, label, solid }: { icon: IconName; label: string; solid?: boolean }) {
  const info = useThemeColor('info');
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-2.5 py-1 ${solid ? 'bg-brand' : 'bg-info-soft'}`}>
      <Ionicons name={icon} size={12} color={solid ? '#ffffff' : info} />
      <Text className={`text-[11px] font-bold ${solid ? 'text-on-brand' : 'text-info'}`}>{label}</Text>
    </View>
  );
}

function Kpi({
  label,
  value,
  subtitle,
  progress,
  accent,
}: {
  label: string;
  value: string;
  subtitle: string;
  progress?: number;
  accent?: boolean;
}) {
  return (
    <View className={`w-[48.5%] rounded-2xl border bg-surface p-3.5 ${accent ? 'border-brand-soft' : 'border-border'}`}>
      <Text className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-muted" numberOfLines={1}>
        {label}
      </Text>
      <Text className={`text-[28px] font-extrabold leading-8 ${accent ? 'text-brand' : 'text-foreground'}`}>{value}</Text>
      {typeof progress === 'number' ? (
        <View className="mt-2.5">
          <Bar value={progress} />
        </View>
      ) : null}
      <Text className="mt-1.5 text-[11px] leading-4 text-muted" numberOfLines={2}>
        {subtitle}
      </Text>
    </View>
  );
}

function Bar({ value, track = 'bg-surface-muted', fill = 'bg-brand' }: { value: number; track?: string; fill?: string }) {
  return (
    <View className={`h-1.5 overflow-hidden rounded-full ${track}`}>
      <View className={`h-full rounded-full ${fill}`} style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} />
    </View>
  );
}

export function Card({
  title,
  subtitle,
  icon,
  iconTone = 'brand',
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTone?: 'brand' | 'danger';
  right?: ReactNode;
  children: ReactNode;
}) {
  const color = useThemeColor(iconTone);
  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      <View className="mb-3 flex-row items-center gap-2">
        {icon ? <Ionicons name={icon} size={18} color={color} /> : null}
        <View className="flex-1">
          <Text className="text-base font-bold text-foreground">{title}</Text>
          {subtitle ? <Text className="text-xs text-muted">{subtitle}</Text> : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

function AlertRow({
  title,
  text,
  danger,
  icon,
  onPress,
}: {
  title: string;
  text: string;
  danger?: boolean;
  icon?: IconName;
  onPress?: () => void;
}) {
  const dangerColor = useThemeColor('danger');
  const muted = useThemeColor('muted');
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      className={`flex-row gap-3 rounded-xl border p-3 active:opacity-70 ${danger ? 'border-danger-soft bg-danger-soft' : 'border-border bg-surface-muted'}`}>
      <Ionicons name={danger ? 'warning' : (icon ?? 'information-circle-outline')} size={17} color={danger ? dangerColor : muted} />
      <View className="flex-1">
        <Text className={`text-sm font-bold ${danger ? 'text-danger' : 'text-foreground'}`}>{title}</Text>
        <Text className="mt-0.5 text-xs leading-4 text-muted">{text}</Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={muted} /> : null}
    </Pressable>
  );
}

function DueRow({ item, now }: { item: StudentAssignmentItem; now: number }) {
  const brand = useThemeColor('brand');
  const muted = useThemeColor('muted');
  const code = item.assignment_type?.code || '';
  const icon: IconName =
    code.includes('listening') || code.includes('audio')
      ? 'headset-outline'
      : code.includes('writing') || code.includes('essay')
        ? 'create-outline'
        : 'document-text-outline';
  const deadline = formatDeadline(item.submission_deadline, now);
  return (
    <Pressable
      onPress={() => openAssignment(item)}
      className="flex-row items-center gap-3 rounded-xl border border-brand-soft p-3 active:opacity-70">
      <View className="h-10 w-10 items-center justify-center rounded-lg bg-info-soft">
        <Ionicons name={icon} size={18} color={brand} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-foreground" numberOfLines={1}>
          {item.title}
        </Text>
        <Text className={`mt-0.5 text-xs font-semibold ${deadline.overdue ? 'text-danger' : 'text-muted'}`} numberOfLines={1}>
          {deadline.text} · {item.class_name}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={muted} />
    </Pressable>
  );
}

function CompareRow({ cls, assignments }: { cls: StudentClassItem; assignments: StudentAssignmentItem[] }) {
  const done = cls.progress >= 100;
  const progress = Math.round(Math.min(Math.max(cls.progress || 0, 0), 100));
  const avg = average(assignments.filter((a) => a.class_id === cls._id).map(assignmentScore10));
  const debt = isDirectTuitionClass(cls) ? Number(cls.remaining_debt || 0) : 0;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/class/[id]', params: { id: cls._id } })}
      className="rounded-xl border border-border p-3 active:opacity-70">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-sm font-bold text-foreground" numberOfLines={1}>
            {classDisplayName(cls)}
          </Text>
          <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
            GV: {cls.teacher?.name || 'Đang cập nhật'}
          </Text>
        </View>
        <View className={`rounded-full px-2 py-0.5 ${done ? 'bg-info-soft' : 'bg-brand-soft'}`}>
          <Text className={`text-[10px] font-semibold ${done ? 'text-info' : 'text-brand'}`}>{done ? 'Hoàn thành' : 'Đang học'}</Text>
        </View>
      </View>
      <View className="mt-3 flex-row items-center gap-2">
        <View className="flex-1">
          <Bar value={progress} fill={done ? 'bg-info' : 'bg-brand'} />
        </View>
        <Text className="w-9 text-right text-[11px] font-bold text-muted">{progress}%</Text>
      </View>
      <View className="mt-3 flex-row justify-between border-t border-border pt-2.5">
        <Text className="text-xs text-muted">
          Điểm TB <Text className="font-bold text-foreground">{formatScore(avg)}</Text>
        </Text>
        <Text className="text-xs text-muted">
          Học phí{' '}
          <Text className={`font-bold ${debt > 0 ? 'text-danger' : 'text-foreground'}`}>{debt > 0 ? formatMoney(debt, true) : '0'}</Text>
        </Text>
      </View>
    </Pressable>
  );
}
