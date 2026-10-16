import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';

import { showToast } from '@/components/ui/toast';
import { Avatar } from '@/components/ui/avatar';
import { MenuButton } from '@/features/navigation/app-menu';
import { NotificationBellButton } from '@/features/notifications/bell-button';
import { dashboardHeaderBackground } from '@/constants/dashboard-backgrounds';
import { STUDENT_DASHBOARD_3D_ICONS } from '@/constants/three-d-icons';
import { mediaCacheKey, useMediaUrl } from '@/lib/media';
import { StateView } from '@/components/ui/state-view';
import { useAllMyAssignments, type StudentAssignmentItem } from '@/features/assignments/api';
import { assignmentKind } from '@/features/assignments/assignment-card';
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
  // Lời chào theo giờ — chốt lúc mở màn, React Compiler cấm gọi Date trong render
  const [hour] = useState(() => new Date().getHours());
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
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
  // Dùng thời điểm mount làm seed: mỗi lần mở mới sẽ có banner khác nhưng không nhấp nháy khi re-render.
  const headerBackground = dashboardHeaderBackground(`${user?._id ?? 'student'}-${now}`);

  return (
    <View className="gap-4">
      {/* ── Hồ sơ ── */}
      <View className="h-52 overflow-hidden rounded-3xl bg-brand-soft">
        <Image
          source={headerBackground}
          style={{ position: 'absolute', bottom: 0, left: 0, right: 0, top: 0 }}
          contentFit="cover"
          transition={250}
          accessible={false}
        />
        <View className="absolute inset-0 bg-black/15" />

        <View className="absolute left-4 right-4 top-4 flex-row items-center gap-2">
          <MenuButton onImage />
          <View className="flex-row items-center gap-1.5 rounded-full border border-white/20 bg-black/30 px-3 py-1.5">
            <Ionicons name="sparkles" size={12} color="#ffffff" />
            <Text className="text-[10px] font-extrabold uppercase tracking-wider text-white">Hành trình học tập</Text>
          </View>
          <View className="flex-1" />
          <NotificationBellButton onImage />
        </View>

        <View className="absolute bottom-4 left-4 right-4 flex-row items-end gap-3">
          <View className="rounded-full border-[3px] border-white bg-white/20">
            <Avatar name={user?.name} uri={avatarUri} cacheKey={mediaCacheKey(user?.avatar)} size={58} />
          </View>
          <View className="min-w-0 flex-1 gap-1.5">
            <View>
              <Text className="text-[12px] font-medium text-white/80">{greeting} 👋</Text>
              <Text className="text-[22px] font-extrabold leading-7 text-white" numberOfLines={1}>
                {user?.name || 'Học viên'}
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-1.5">
              <Pill icon="book" label={`${view.learningCount} lớp đang học`} solid />
              <Pill icon="checkmark-circle" label={`${view.completedCount} lớp hoàn thành`} />
            </View>
          </View>
        </View>
      </View>

      {/* ── Danh mục ── */}
      {shortcuts}

      <NextClassCard upcoming={upcoming} />

      {/* ── KPI 2×2 ── */}
      <View className="flex-row flex-wrap justify-between gap-y-3">
        <Kpi
          icon3d={STUDENT_DASHBOARD_3D_ICONS.classes}
          label="Tổng số lớp"
          value={String(view.classes.length).padStart(2, '0')}
          subtitle="Hành trình học tập"
          accent
        />
        <Kpi
          icon3d={STUDENT_DASHBOARD_3D_ICONS.attendance}
          label="Chuyên cần TB"
          value={m.attendanceRate !== null ? `${m.attendanceRate}%` : '—'}
          subtitle={m.totalSessions > 0 ? `${m.attendedSessions}/${m.totalSessions} buổi hiện tại` : 'Chưa có dữ liệu điểm danh'}
          progress={m.attendanceRate ?? 0}
        />
        <Kpi
          icon3d={STUDENT_DASHBOARD_3D_ICONS.averageScore}
          label="Điểm trung bình"
          value={formatScore(view.averageScore)}
          subtitle={`Xếp loại: ${gradeLabel(view.averageScore)}`}
        />
        <Kpi
          icon3d={STUDENT_DASHBOARD_3D_ICONS.learningIndex}
          label="Chỉ số học tập"
          value={`${m.learningIndex}%`}
          subtitle={`BT ${m.assignmentCompleted}/${m.assignmentTotal} • ${m.totalSessions > 0 ? `Đi học ${m.attendedSessions}/${m.totalSessions}` : 'Chưa có điểm danh'}`}
          progress={m.learningIndex}
          accent
        />
      </View>

      {/* ── Cảnh báo ── */}
      <Card title="Cảnh báo & Lưu ý" icon3d={STUDENT_DASHBOARD_3D_ICONS.warning}>
        <View className="gap-2.5">
          {view.topRisk ? (
            <AlertRow
              danger
              icon3d={STUDENT_DASHBOARD_3D_ICONS.warning}
              title={view.topRisk.level === 'high' ? 'Lớp nguy cơ cao' : 'Lớp cần chú ý'}
              text={`Lớp ${view.topRisk.className} có ${view.topRisk.reasons.join(', ')}.`}
              onPress={() => router.push({ pathname: '/class/[id]', params: { id: view.topRisk!.classId } })}
            />
          ) : (
            <AlertRow icon3d={STUDENT_DASHBOARD_3D_ICONS.safe} title="Lớp nguy cơ cao" text="Chưa có lớp nào có dấu hiệu rủi ro." />
          )}
          <AlertRow
            danger={view.overdue.length > 0}
            icon3d={STUDENT_DASHBOARD_3D_ICONS.overdue}
            title="Bài tập quá hạn"
            text={view.overdue.length > 0 ? `Bạn có ${view.overdue.length} bài tập đang quá hạn.` : 'Không có bài tập quá hạn.'}
            onPress={view.overdue.length > 0 ? () => router.navigate('/assignments') : undefined}
          />
        </View>
      </Card>

      {/* ── Bài tập cần làm ── */}
      <Card
        title="Bài tập cần làm"
        icon3d={STUDENT_DASHBOARD_3D_ICONS.assignments}
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
              <View key={g.key} className="gap-2.5">
                <View className="flex-row items-center gap-2 rounded-xl bg-brand-soft px-3 py-2">
                  <View className="h-7 w-7 items-center justify-center rounded-lg bg-surface">
                    <Ionicons name={g.key === 'online' ? 'videocam' : 'laptop-outline'} size={15} color={brand} />
                  </View>
                  <Text className="flex-1 text-[11px] font-extrabold uppercase tracking-wider text-brand">{g.title}</Text>
                  <View className="rounded-full bg-surface px-2 py-0.5">
                    <Text className="text-[10px] font-bold text-brand">{g.classes.length} lớp</Text>
                  </View>
                </View>
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
        showToast('warning', 'Lớp đang bị khoá', cls.access_lock_reason || 'Vui lòng liên hệ Uspeak để được hỗ trợ.');
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
  icon3d,
  label,
  value,
  subtitle,
  progress,
  accent,
}: {
  icon3d?: number;
  label: string;
  value: string;
  subtitle: string;
  progress?: number;
  accent?: boolean;
}) {
  return (
    <View className={`w-[48.5%] rounded-2xl border bg-surface p-3.5 ${accent ? 'border-brand-soft' : 'border-border'}`}>
      <View className="mb-1 flex-row items-start justify-between gap-2">
        <Text className="flex-1 text-[10px] font-extrabold uppercase tracking-wider text-muted" numberOfLines={1}>
          {label}
        </Text>
        {icon3d ? <Image source={icon3d} style={{ width: 32, height: 32 }} contentFit="contain" accessible={false} /> : null}
      </View>
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
  icon3d,
  iconTone = 'brand',
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  icon3d?: number;
  iconTone?: 'brand' | 'danger';
  right?: ReactNode;
  children: ReactNode;
}) {
  const color = useThemeColor(iconTone);
  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      <View className="mb-3 flex-row items-center gap-2">
        {icon3d ? (
          <Image source={icon3d} style={{ width: 24, height: 24 }} contentFit="contain" accessible={false} />
        ) : icon ? (
          <Ionicons name={icon} size={18} color={color} />
        ) : null}
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
  icon3d,
  onPress,
}: {
  title: string;
  text: string;
  danger?: boolean;
  icon?: IconName;
  icon3d?: number;
  onPress?: () => void;
}) {
  const dangerColor = useThemeColor('danger');
  const muted = useThemeColor('muted');
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      className={`flex-row gap-3 rounded-xl border p-3 active:opacity-70 ${danger ? 'border-danger-soft bg-danger-soft' : 'border-border bg-surface-muted'}`}>
      <View className="h-8 w-8 items-center justify-center">
        {icon3d ? (
          <Image source={icon3d} style={{ width: 32, height: 32 }} contentFit="contain" accessible={false} />
        ) : (
          <Ionicons name={danger ? 'warning' : (icon ?? 'information-circle-outline')} size={17} color={danger ? dangerColor : muted} />
        )}
      </View>
      <View className="flex-1">
        <Text className={`text-sm font-bold ${danger ? 'text-danger' : 'text-foreground'}`}>{title}</Text>
        <Text className="mt-0.5 text-xs leading-4 text-muted">{text}</Text>
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={muted} /> : null}
    </Pressable>
  );
}

function DueRow({ item, now }: { item: StudentAssignmentItem; now: number }) {
  const muted = useThemeColor('muted');
  const kind = assignmentKind(item);
  const tint = useThemeColor(kind.color);
  const deadline = formatDeadline(item.submission_deadline, now);
  return (
    <Pressable
      onPress={() => openAssignment(item)}
      className="flex-row items-center gap-3 rounded-xl border border-brand-soft p-3 active:opacity-70">
      <View className={`h-10 w-10 items-center justify-center overflow-hidden rounded-lg ${kind.icon3d ? '' : kind.box}`}>
        {kind.icon3d ? (
          <Image source={kind.icon3d} style={{ width: 40, height: 40 }} contentFit="contain" accessible={false} />
        ) : (
          <Ionicons name={kind.icon} size={18} color={tint} />
        )}
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
  const teacherAvatarUri = useMediaUrl(cls.teacher?.avatar);
  const muted = useThemeColor('muted');
  const brand = useThemeColor('brand');
  const success = useThemeColor('success');
  const warning = useThemeColor('warning');
  const danger = useThemeColor('danger');
  const progressTone = done || progress >= 80 ? { bar: 'bg-success', text: 'text-success' } : progress >= 50 ? { bar: 'bg-info', text: 'text-info' } : progress > 0 ? { bar: 'bg-warning', text: 'text-warning' } : { bar: 'bg-border', text: 'text-muted' };
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/class/[id]', params: { id: cls._id } })}
      accessibilityRole="button"
      accessibilityLabel={`Mở lớp ${classDisplayName(cls)}`}
      className="rounded-2xl border border-border bg-surface p-3.5 active:bg-surface-muted">
      <View className="flex-row items-start gap-3">
        <Avatar
          name={cls.teacher?.name || classDisplayName(cls)}
          uri={teacherAvatarUri}
          cacheKey={mediaCacheKey(cls.teacher?.avatar)}
          size={38}
        />
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-[15px] font-bold leading-5 text-foreground" numberOfLines={2}>
            {classDisplayName(cls)}
          </Text>
          <View className="flex-row items-center gap-1.5">
            <Ionicons name="person-outline" size={12} color={muted} />
            <Text className="flex-1 text-xs text-muted" numberOfLines={1}>
              {cls.teacher?.name || 'Đang cập nhật giáo viên'}
            </Text>
          </View>
        </View>
        <View className={`flex-row items-center gap-1 rounded-full px-2 py-1 ${done ? 'bg-success-soft' : 'bg-brand-soft'}`}>
          <Ionicons name={done ? 'checkmark-circle' : 'play-circle'} size={12} color={done ? success : brand} />
          <Text className={`text-[10px] font-bold ${done ? 'text-success' : 'text-brand'}`}>{done ? 'Hoàn thành' : 'Đang học'}</Text>
        </View>
      </View>

      <View className="mt-3.5 gap-1.5">
        <View className="flex-row items-center justify-between">
          <Text className="text-[11px] font-semibold text-muted">Tiến độ khóa học</Text>
          <Text className={`text-xs font-extrabold ${progressTone.text}`}>{progress}%</Text>
        </View>
        <View className="h-2 overflow-hidden rounded-full bg-surface-muted">
          <View className={`h-full rounded-full ${progressTone.bar}`} style={{ width: `${progress}%` }} />
        </View>
      </View>

      <View className="mt-3 flex-row items-center rounded-xl bg-surface-muted px-3 py-2.5">
        <View className="flex-1 flex-row items-center gap-2">
          <View className="h-7 w-7 items-center justify-center rounded-lg bg-warning-soft">
            <Ionicons name="star" size={14} color={warning} />
          </View>
          <View>
            <Text className="text-[10px] text-muted">Điểm trung bình</Text>
            <Text className="text-[13px] font-extrabold text-foreground">{formatScore(avg)}</Text>
          </View>
        </View>
        <View className="mx-2 h-8 w-px bg-border" />
        <View className="flex-1 flex-row items-center justify-end gap-2">
          <View className={`h-7 w-7 items-center justify-center rounded-lg ${debt > 0 ? 'bg-danger-soft' : 'bg-success-soft'}`}>
            <Ionicons name="wallet-outline" size={14} color={debt > 0 ? danger : success} />
          </View>
          <View className="items-end">
            <Text className="text-[10px] text-muted">Học phí</Text>
            <Text className={`text-[13px] font-extrabold ${debt > 0 ? 'text-danger' : 'text-success'}`}>{formatMoney(debt, true)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
