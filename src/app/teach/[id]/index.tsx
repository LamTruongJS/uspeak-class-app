import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, RefreshControl, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { CollapsingTopBar, CoverStatusBar, useCollapsingHeader } from '@/components/ui/collapsing-header';
import { ProgressRing } from '@/components/ui/progress-ring';
import { LoadingView, StateView } from '@/components/ui/state-view';
import {
  CLASS_CONTENT_3D_ICONS,
  CLASS_QUICK_ACTION_3D_ICONS,
  STAFF_CLASS_MANAGEMENT_3D_ICONS,
  STUDENT_DASHBOARD_3D_ICONS,
} from '@/constants/three-d-icons';
import { useChatRooms } from '@/features/chat/api';
import { countdownLabel, nextSession, scheduleParts, sessionDayLabel } from '@/features/classes/next-session';
import { COURSE_TYPE_LABEL, STATUS_META, useStaffClassDetail, useStaffClasses, type StaffClassItem } from '@/features/classes/staff-api';
import { ClassCover, QuickActions } from '@/features/classes/student-class-hero';
import { getErrorMessage } from '@/lib/api/client';
import { formatDate, WEEKDAY_SHORT } from '@/lib/format';
import { resolveMediaUrl, useMediaToken } from '@/lib/media';
import { usePullRefresh } from '@/lib/use-pull-refresh';
import { useThemeColor, type ThemeColor } from '@/theme/use-theme-color';

/**
 * Chi tiết lớp dạy (giáo viên / trợ giảng / quản trị) — cùng bố cục với chi tiết lớp học viên:
 * trang TỔNG QUAN (ảnh bìa tràn, thanh trên trong suốt, buổi dạy tiếp theo, lối tắt, 3 vòng chỉ số)
 * rồi danh sách mục dọc, mỗi mục mở MỘT MÀN RIÊNG (`teach/[id]/students|assignments|attendance|notifications`).
 *
 * Bỏ thanh tab cuộn ngang vì lý do như bên học viên: trên điện thoại tab tràn khỏi màn hình và đổi
 * tab là mất chỗ đang đọc. Không còn nút "Bản web" (15/10/2026): điểm danh, thông báo, khoá/bảo lưu học
 * viên, nhân bản/xoá bài tập làm ngay trong từng màn.
 */
export default function TeachClassScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const brand = useThemeColor('brand');
  const { data: token } = useMediaToken();

  const classes = useStaffClasses();
  const cls = classes.data?.find((c) => c._id === id);
  const detail = useStaffClassDetail(id);
  const rooms = useChatRooms();

  const stats = detail.data?.stats;
  const classRoom = (rooms.data ?? []).find((r) => r.class_id === id && r.type === 'class');
  // Học viên cần chú ý: còn ≥ 2 bài chưa nộp hoặc nộp < 50%
  const attentionCount = (detail.data?.students ?? []).filter((s) => s.not_submitted_count >= 2 || s.completion_rate < 50).length;

  const pull = usePullRefresh(() => Promise.all([detail.refetch(), classes.refetch()]));
  const ch = useCollapsingHeader();

  const openChat = () => classRoom && router.push({ pathname: '/chat/[roomId]', params: { roomId: classRoom._id } });
  const go = (
    section: 'students' | 'assignments' | 'attendance' | 'notifications' | 'submissions' | 'report' | 'groups' | 'surveys' | 'certificates' | 'exemptions' | 'practice',
    params?: Record<string, string>,
  ) =>
    router.push({ pathname: `/teach/[id]/${section}`, params: { id, ...params } });

  if (detail.isError) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: cls?.class_code ?? 'Lớp học', headerShown: true }} />
        <StateView
          icon="cloud-offline-outline"
          title="Không tải được lớp"
          description={getErrorMessage(detail.error)}
          actionLabel="Thử lại"
          onAction={() => detail.refetch()}
        />
      </View>
    );
  }
  if (!cls && classes.isLoading) {
    return (
      <View className="flex-1 bg-background">
        <Stack.Screen options={{ title: 'Lớp học', headerShown: true }} />
        <LoadingView />
      </View>
    );
  }

  const status = cls ? STATUS_META[cls.status_class] : null;
  const live = cls?.status_class === 'IN_PROGRESS' || cls?.status_class === 'CLOSED_REGISTRATION';

  return (
    <View className="flex-1 bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <CoverStatusBar collapsed={ch.collapsed} />

      <Animated.ScrollView
        onScroll={ch.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: ch.bottomInset + 28 }}
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.onRefresh}
            tintColor="#ffffff"
            colors={[brand]}
            progressViewOffset={ch.topBar}
          />
        }
        showsVerticalScrollIndicator={false}>
        <View onLayout={ch.onHeroLayout}>
          <ClassCover
            id={id}
            image={cls?.class_image}
            title={cls?.display_name || cls?.class_name || 'Lớp học'}
            code={cls?.class_code ?? ''}
            token={token?.media_token}
            topInset={ch.topInset}
            chips={[
              ...(status ? [{ label: status.label, tone: status.tone === 'success' ? ('success' as const) : ('light' as const) }] : []),
              ...(cls ? [{ label: COURSE_TYPE_LABEL[cls.course_type] ?? cls.course_type, tone: 'dark' as const }] : []),
            ]}
          />
          <View className="-mt-6 gap-3.5 rounded-t-[28px] bg-background px-4 pb-4 pt-5">
            {cls?.teacher?.name ? (
              <View className="flex-row items-center gap-3">
                <Avatar name={cls.teacher.name} uri={resolveMediaUrl(cls.teacher.avatar, token?.media_token)} size={44} />
                <View className="flex-1">
                  <Text className="text-[16px] font-bold text-foreground" numberOfLines={1}>
                    {cls.teacher.name}
                  </Text>
                  <Text className="text-[13px] text-muted" numberOfLines={1}>
                    Giảng viên
                    {cls.start_date ? ` · ${formatDate(cls.start_date)}${cls.end_date ? ` → ${formatDate(cls.end_date)}` : ''}` : ''}
                  </Text>
                </View>
              </View>
            ) : null}

            {cls && live ? <NextTeachCard cls={cls} /> : null}

            <QuickActions
              actions={[
                {
                  key: 'chat',
                  icon: 'chatbubbles',
                  icon3d: CLASS_QUICK_ACTION_3D_ICONS.chat,
                  label: 'Chat lớp',
                  tone: 'brand',
                  disabled: !classRoom,
                  badge: classRoom?.notifications_muted ? undefined : classRoom?.unread_count || undefined,
                  onPress: () => void openChat(),
                },
                {
                  key: 'grade',
                  icon: 'create',
                  icon3d: CLASS_QUICK_ACTION_3D_ICONS.grade,
                  label: 'Chấm bài',
                  tone: 'warning',
                  onPress: () => router.push('/assignments'),
                },
                {
                  key: 'gradebook',
                  icon: 'podium',
                  icon3d: CLASS_QUICK_ACTION_3D_ICONS.gradebook,
                  label: 'Bảng điểm',
                  tone: 'info',
                  onPress: () => router.push({ pathname: '/grading/gradebook/[classId]', params: { classId: id } }),
                },
                {
                  key: 'attendance',
                  icon: 'checkbox',
                  icon3d: CLASS_QUICK_ACTION_3D_ICONS.attendance,
                  label: 'Điểm danh',
                  tone: 'success',
                  onPress: () => go('attendance'),
                },
              ]}
            />

            {detail.isLoading ? (
              <ActivityIndicator className="py-6" color={brand} />
            ) : stats ? (
              <StatsCard
                stats={stats}
                activeStudents={cls?.active_students}
                maxStudents={cls?.max_students}
                attention={attentionCount}
                onOpenStudents={() => go('students', { sort: 'attention' })}
              />
            ) : null}
          </View>
        </View>

        <View className="gap-2.5 px-4">
          <View className="flex-row items-center gap-1.5 pl-1">
            <Image
              source={STAFF_CLASS_MANAGEMENT_3D_ICONS.students}
              style={{ width: 27, height: 27 }}
              contentFit="contain"
              accessible={false}
            />
            <Text className="text-[12.5px] font-bold uppercase tracking-wide text-muted">Quản lý lớp</Text>
          </View>

          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.students}
            title="Học viên"
            subtitle={
              detail.data
                ? `${detail.data.students.length} học viên${attentionCount ? ` · ${attentionCount} cần chú ý` : ''}`
                : 'Danh sách học viên, tiến độ từng người'
            }
            badge={attentionCount || undefined}
            onPress={() => go('students')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.assignments}
            title="Bài tập"
            subtitle={stats ? `${stats.total_assignments} bài tập · ${stats.total_submissions.toLocaleString('vi-VN')} bài nộp` : 'Bài tập của lớp'}
            onPress={() => go('assignments')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.attendance}
            title="Điểm danh"
            subtitle="Tạo buổi học, đánh có mặt / vắng, lý do vắng"
            onPress={() => go('attendance')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.notifications}
            title="Thông báo lớp"
            subtitle="Đăng, hẹn giờ, sửa, xoá thông báo cho lớp"
            onPress={() => go('notifications')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.submissions}
            title="Bài nộp"
            subtitle="Chấm, review, duyệt nhanh bài của lớp"
            onPress={() => go('submissions')}
          />

          <Text className="pl-1 pt-3 text-[12.5px] font-bold uppercase tracking-wide text-muted">Theo dõi & tiện ích</Text>
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.report}
            title="Báo cáo lớp"
            subtitle="Học viên cần lưu tâm, thiếu bài, vắng học"
            onPress={() => go('report')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.groups}
            title="Danh sách nhóm"
            subtitle={detail.data?.groups?.length ? `${detail.data.groups.length} nhóm thảo luận` : 'Nhóm thảo luận + trợ giảng'}
            onPress={() => go('groups')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.surveys}
            title="Khảo sát"
            subtitle="Ai đã trả lời, nhắc người chưa làm"
            onPress={() => go('surveys')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.certificates}
            title="Chứng chỉ học tập"
            subtitle="Xét điều kiện, gửi chứng chỉ"
            onPress={() => go('certificates')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.practice}
            title="Luyện tập nói"
            subtitle="Bộ câu luyện tập, tiến độ học viên"
            onPress={() => go('practice')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.exemptions}
            title="Không cần nhận xét"
            subtitle="Học viên nộp bài là tự hoàn thành"
            onPress={() => go('exemptions')}
          />
          <MenuRow
            icon3d={STAFF_CLASS_MANAGEMENT_3D_ICONS.elearning}
            title="E-Learning"
            subtitle="Xem nội dung E-Learning của lớp"
            onPress={() => router.push({ pathname: '/elearning/[classId]', params: { classId: id } })}
          />
        </View>
      </Animated.ScrollView>

      <CollapsingTopBar
        title={cls?.display_name || cls?.class_name || 'Lớp học'}
        header={ch}
        actions={
          classRoom
            ? [
                {
                  icon: 'chatbubbles-outline',
                  label: 'Chat lớp',
                  onPress: () => void openChat(),
                  badge: !!classRoom.unread_count && !classRoom.notifications_muted,
                },
              ]
            : []
        }
      />
    </View>
  );
}

/** Một mục quản lý lớp: icon màu + tên + dòng số liệu + số việc cần chú ý. */
function MenuRow({
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
function NextTeachCard({ cls }: { cls: StaffClassItem }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const session = nextSession(cls.class_time, now);
  const parts = scheduleParts(cls.class_time);
  if (!session) {
    return cls.class_time ? (
      <View className="gap-0.5 rounded-3xl bg-surface p-4">
        <Text className="text-[12px] font-semibold text-muted">Lịch dạy</Text>
        <Text className="text-[15px] font-bold text-foreground">{cls.class_time}</Text>
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
        <Text className="text-[12px] font-semibold text-muted">Buổi dạy tiếp theo</Text>
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

/** 3 vòng chỉ số lớp + dòng "N học viên cần chú ý" (bấm → màn Học viên, sắp xếp Cần chú ý). */
function StatsCard({
  stats,
  activeStudents,
  maxStudents,
  attention,
  onOpenStudents,
}: {
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
  const reviewedRate = stats.total_submissions ? Math.round((stats.total_completed / stats.total_submissions) * 100) : 0;
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
          <Text className="text-[15px] font-bold text-foreground">Tình hình lớp</Text>
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
